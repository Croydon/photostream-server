angular.module('App').controller('ToolbarController', ['$scope', 'photoStreamService', function ($scope, photoStreamService) {

    $scope.data = photoStreamService.data;

    function OnScroll(ev){
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
            $scope.loadMorePhotos();
        }
    }

    $scope.reloadPhotos = function(){
        $scope.data.isLoadingPhotos = true;
        photoStreamService.loadPhotos(function(){
            $scope.data.isLoadingPhotos = false;
            setTimeout(function(){
                OnScroll();
            }, 500);
        });
    };

    $scope.loadMorePhotos = function () {
        if (!$scope.data.isLoadingPhotos) {
            $scope.data.isLoadingPhotos = true;
            photoStreamService.loadMorePhotos(function () {
                $scope.data.isLoadingPhotos = false;
                if ($(document).height() <= $(window).height()) {
                    $scope.loadMorePhotos();
                }
            });
        }
    };

}]);
