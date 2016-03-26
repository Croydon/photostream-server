angular.module('App').controller('ToolbarController', ['$scope', 'appState', function ($scope, appState) {
    $scope.data = appState.data;
    $scope.onError = function (err) { console.log(err); };
    $scope.onStream = function (stream) { };
    $scope.onSuccess = function () { console.log('success')};
}]);