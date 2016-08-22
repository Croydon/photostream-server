angular.module('App').service('photoStreamService', ['$http','socketClient',function($http, socket) {

    var token = localStorage.getItem("token");

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
        $http.get('/photostream/api/image/' + photoId + '/comments', {headers: { 'installation_id': token} }
        ).then(function (response) {
            for (var i = 0; i < response.data.comments.length; i++){
                if (response.data.comments[i].message != null)
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
            url: '/photostream/api/comment/' + commentId,
            headers: {
                'installation_id': token
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
            url: '/photostream/api/image/' + photoId,
            headers: {
                'installation_id': token
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
            url: '/photostream/api/image/' + photoId + '/comment',
            headers: {
                'installation_id': token,
                'Content-Type': 'application/json'
            },
            data : { message: comment}
        }).then(function (response) {
            callback(true);
            notifyNewComment(response.data);
        }, function (error) {
            callback(false);
            console.log(error);
        });
    };

    self.loadPhotos = function(callback){
        $http.get('/photostream/api/stream', {headers: { 'installation_id': token} }
        ).then(function (response) {
            for (var i = 0; i < response.data.photos.length; i++){
                if (response.data.photos[i].comment != null)
                    response.data.photos[i].comment = response.data.photos[i].comment.replace(/\n/g, '<br/>');
                response.data.photos[i].image = 'http://' + window.location.hostname + ':' + window.location.port + "/photostream/api/image/" + response.data.photos[i].photo_id + "/content";
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
        $http.get('/photostream/api/stream/more', {headers: { 'installation_id': token} }
        ).then(function (response) {
            for (var i = 0; i < response.data.photos.length; i++){
                response.data.photos[i].image = 'http://' + window.location.hostname + ':' + window.location.port + "/photostream/api/image/" + response.data.photos[i].photo_id + "/content";
                self.data.photos.push(response.data.photos[i]);
            }
            if (response.data.has_next_page)
                callback();
        }, function (error) {
            console.log(error);
        });
    };

    var events = {
        CONNECT : 'connect',
        DISCONNECT : 'disconnect',
        PHOTO_DELETED: 'photo_deleted',
        COMMENT_DELETED: 'comment_deleted',
        NEW_PHOTO: 'new_photo',
        NEW_COMMENT: 'new_comment',
        NEW_COMMENT_COUNT: 'new_comment_count'
    };

    self.connected = false;

    socket.on(events.CONNECT, function () {
        self.connected = true;
    });

    socket.on(events.DISCONNECT, function () {
        self.connected = false;
    });

    socket.on(events.NEW_PHOTO, function(item){
        if (item.comment != null) {
            item.comment = item.comment.replace(/\n/g, '<br/>');
        }
        item.image = 'http://' + window.location.hostname + ':' + window.location.port + "/photostream/api/image/" + item.photo_id + "/content";
        self.data.photos.unshift(item);
    });

    socket.on(events.NEW_COMMENT_COUNT, function(item){
        var photoId = item.photo_id;
        var comment_count = item.comment_count;
        for (var position = 0; position < self.data.photos.length; position++) {
            var photo = self.data.photos[position];
            if (photo.photo_id == photoId) {
                self.data.photos[position].comment_count = comment_count;
                break;
            }
        }
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