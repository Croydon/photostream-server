angular.module('App').controller('ToolbarController', ['$scope', 'appState', function ($scope, appState) {
    $scope.data = appState.data;
    $scope.reloadPhotos = function(){
        $scope.data.isLoadingPhotos = true;
        appState.loadPhotos(function(){
            $scope.data.isLoadingPhotos = false;
        });
    };

    $scope.reloadPhotos();

}]);
