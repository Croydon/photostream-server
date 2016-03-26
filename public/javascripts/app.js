/**
 * Created by Andy on 02.09.2015.
 */
deferredBootstrapper.bootstrap({
    element: document.body,
    module: 'App',
    resolve: {
        TOKEN: ['$http', '$q', function ($http, $q) {

            var deferred = $q.defer();

            deferred.resolve('test');

            return deferred.promise;
        }]
    },
    onError: function (error) {
        alert('Could not bootstrap, error: ' + error);
    }
});

var app = angular.module('App', ['ngMaterial','ngAnimate','btford.socket-io','ui.router', 'ngSanitize'])
    .config(function($mdThemingProvider) {
        $mdThemingProvider.theme('default')
            .primaryPalette('teal')
            .accentPalette('orange');
});

app.factory('mySocket', ['socketFactory','$http','TOKEN',function(socketFactory,$http,TOKEN) {
    var url = 'http://' + window.location.hostname + ':' + window.location.port;
    var myIoSocket = io.connect(url,{ query: "token=" + TOKEN });
    var mySocket = socketFactory({
        ioSocket: myIoSocket
    });
    return mySocket;
}]);

app.factory('httpInterceptor', function ($q, $rootScope, $log) {
    var numLoadings = 0;

    return {
        request: function (config) {

            numLoadings++;

            // Show loader
            $rootScope.$broadcast("loader_show");
            return config || $q.when(config)

        },
        response: function (response) {

            if ((--numLoadings) === 0) {
                // Hide loader
                $rootScope.$broadcast("loader_hide");
            }

            return response || $q.when(response);

        },
        responseError: function (response) {

            if (!(--numLoadings)) {
                // Hide loader
                $rootScope.$broadcast("loader_hide");
            }

            return $q.reject(response);
        }
    };
}).config(function ($httpProvider) {
        $httpProvider.interceptors.push('httpInterceptor');
    });

app.directive("loader", function ($rootScope) {
        return function ($scope, element, attrs) {
            $scope.$on("loader_show", function () {
                return element.show();
            });
            return $scope.$on("loader_hide", function () {
                return element.hide();
            });
        };
    }
);

app.service('appState', ['$rootScope','$http','mySocket',function($rootScope, $http, socket) {

    var self = this;

    self.data = {
        photos: [],
        currentPhoto: undefined,
        comments: [],
        isLoadingPhotos : false
    };

    var commentsCallbacks = [];

    self.addCommentsCallback = function(callback){
        if (commentsCallbacks.indexOf(callback) < 0)
            commentsCallbacks.push(callback);
    };

    self.removeCommentsCallback = function(callback){
        var pos = commentsCallbacks.indexOf(callback);
        if (pos >= 0)
            commentsCallbacks.splice(pos, 1);
    };

    function getPhoto(photoId){
        var photo = undefined;
        var photos = self.data.photos;
        for (var i = 0; i < photos.length; i++){
            if(photos[i].photo_id == photoId){
                photo = photos[i];
                break;
            }
        }
        return photo;
    }

    self.loadComments = function(photoId, callback){
        $http.get('/photostream/image/' + photoId + '/comments', {headers: { 'installation_id': 'test'} }
        ).then(function (response) {
            for (var i = 0; i < response.data.comments.length; i++){
                response.data.comments[i].message = response.data.comments[i].message.replace(/\n/g, '<br/>');
            }
            self.data.currentPhoto = getPhoto(response.data.photo_id);
            self.data.comments = response.data.comments;
            callback();
        }, function (error) {
            console.log(error);
            self.data.comments = [];
        });
    };

    self.deleteComment = function(commentId, callback){
        $http
        ({
            method: 'DELETE',
            url: '/photostream/comment/' + commentId,
            headers: {
                'installation_id': 'test'
            }
        }).then(function (response) {
            notifyOnCommentDeleted(commentId);
            callback(true);
        }, function (error) {
            callback(false);
            console.log(error);
        });
    };

    self.deletePhoto = function(photoId, callback){
        $http
        ({
            method: 'DELETE',
            url: '/photostream/image/' + photoId,
            headers: {
                'installation_id': 'test'
            }
        }).then(function (response) {
            var photos = self.data.photos;
            for (var i = 0; i < photos.length; i++){
                if(photos[i].photo_id == photoId){
                    photos.splice(i, 1);
                    break;
                }
            }
            callback(true);
        }, function (error) {
            callback(false);
            console.log(error);
        });
    };

    self.sendComment = function(photoId, comment, callback){
        $http
        ({
            method: 'POST',
            url: '/photostream/image/' + photoId + '/comment',
            headers: {
                'installation_id': 'test',
                'Content-Type': 'application/json'
            },
            data : { message: comment}
        }).then(function (response) {
            callback(true);
            console.log(response.data);
            notifyNewComment(response.data);
        }, function (error) {
            callback(false);
            console.log(error);
        });
    };

    self.loadPhotos = function(callback){
        $http.get('/photostream/stream', {headers: { 'installation_id': 'test'} }
        ).then(function (response) {
            for (var i = 0; i < response.data.photos.length; i++){
                response.data.photos[i].comment = response.data.photos[i].comment.replace(/\n/g, '<br/>');
            }
            self.data.photos = response.data.photos;
            callback();
        }, function (error) {
            console.log(error);
            self.data.photos = [];
            callback();
        });
    };

    self.loadMorePhotos = function(callback){
        $http.get('/photostream/stream/more', {headers: { 'installation_id': 'test'} }
        ).then(function (response) {
            for (var i = 0; i < response.data.photos.length; i++){
                self.data.photos.push(response.data.photos[i]);
            }
            if (response.data.has_next_page)
                callback();
        }, function (error) {
            console.log(error);
            callback();
        });
    };

    var events = {
        CONNECT : 'connect',
        DISCONNECT : 'disconnect',
        PHOTO_DELETED: 'photo_deleted',
        COMMENT_DELETED: 'comment_deleted',
        NEW_PHOTO: 'new_photo',
        NEW_COMMENT: 'new_comment'
    };

    self.connected = false;

    socket.on(events.CONNECT, function () {
        self.connected = true;
    });

    socket.on(events.DISCONNECT, function () {
        self.connected = false;
    });

    socket.on(events.NEW_PHOTO, function(item){
        item.comment = item.comment.replace(/\n/g, '<br/>');
        self.data.photos.unshift(item);
    });

    function notifyNewComment(item){
        for (var i = 0; i < commentsCallbacks.length; i++) {
            commentsCallbacks[i].onNewComment(item);
        }
    }

    socket.on(events.NEW_COMMENT, function(item){
        notifyNewComment(item);
    });

    socket.on(events.PHOTO_DELETED, function(photoId){
        for (var position = 0; position < self.data.photos.length; position++) {
            var photo = self.data.photos[position];
            if (photo.photo_id == photoId) {
                self.data.photos.splice(position, 1);
                break;
            }
        }
    });

    socket.on(events.COMMENT_DELETED, function(commentId){
        notifyOnCommentDeleted(commentId);
    });

    function notifyOnCommentDeleted(commentId){
        for (var i = 0; i < commentsCallbacks.length; i++) {
            commentsCallbacks[i].onCommentDeleted(commentId);
        }
    }

}]);

app.config(['$stateProvider','$locationProvider', '$urlRouterProvider',function($stateProvider,$locationProvider, $urlRouterProvider,TOKEN) {
    $stateProvider
        .state('home', {
            url: "/",
            templateUrl: "/javascripts/template/home.html",
            controller: "AppController"
        });

    $urlRouterProvider.otherwise("home");

    $locationProvider.html5Mode(true);
}]);