angular.module('App').controller('ToolbarController', ['$scope', 'photoStreamService', function ($scope, photoStreamService) {
    $scope.data = photoStreamService.data;
    $scope.reloadPhotos = function(){
        $scope.data.isLoadingPhotos = true;
        photoStreamService.loadPhotos(function(){
            $scope.data.isLoadingPhotos = false;
        });
    };

    $scope.reloadPhotos();

}]);
