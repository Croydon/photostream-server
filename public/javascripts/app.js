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

app.factory('socketClient', ['socketFactory','$http','TOKEN',function(socketFactory,$http,TOKEN) {
    var url = 'http://' + window.location.hostname + ':' + window.location.port;
    var myIoSocket = io.connect(url,{ query: "token=" + TOKEN });
    var socketClient = socketFactory({
        ioSocket: myIoSocket
    });
    return socketClient;
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

app.config(['$stateProvider','$locationProvider', '$urlRouterProvider',function($stateProvider,$locationProvider, $urlRouterProvider,TOKEN) {
    $stateProvider
        .state('stream', {
            url: "/stream",
            templateUrl: "/javascripts/template/stream.html",
            controller: "AppController"
        });

    $urlRouterProvider.otherwise("stream");

    $locationProvider.html5Mode(true);
}]);