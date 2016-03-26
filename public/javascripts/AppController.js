angular.module('App').controller('AppController', ['$scope', '$mdDialog', '$http', 'appState', function ($scope, $mdDialog, $http, appState) {

    $scope.data = appState.data;

    $scope.loadMorePhotos = function(){
        if (!$scope.data.isLoadingPhotos) {
            $scope.data.isLoadingPhotos = true;
            appState.loadMorePhotos(function(){
                $scope.data.isLoadingPhotos = false;
                if ($(document).height() == $(window).height()){
                    $scope.loadMorePhotos();
                }
            });
        }
    };

    $scope.showPhotoInModal = function($event, index){
        $event.stopPropagation();
        function onDialogShowing(){
            var cssLeft = ($(document).width() - $('md-dialog').width()) / 2;
            $('md-dialog').css('left', cssLeft + "px");

        };

        $scope.data.currentPhoto = $scope.data.photos[index];
        $mdDialog.show({
            parent: angular.element(document.body),
            templateUrl : '/javascripts/template/image-dialog.html',
            onComplete : onDialogShowing,
            controller: function ModalController($scope, $mdDialog) {

                $scope.commentText = '';
                $scope.data = appState.data;

                $scope.closePhoto = function () {
                    $mdDialog.hide();
                };
            }
        });
    };

    $scope.deletePhoto = function(photo){
      appState.deletePhoto(photo.photo_id, function(success){

      });
    };

    $scope.showPhoto = function (photo) {
        appState.loadComments(photo.photo_id, function(){

            function onDialogShowing(){
                $('.md-errors-spacer').remove();
            }

            $mdDialog.show({
                    parent: angular.element(document.body),
                    templateUrl : '/javascripts/template/dialog.html',
                    onComplete: onDialogShowing,
                    controller: function DialogController($scope, $mdDialog) {

                        $scope.commentText = '';
                        $scope.data = appState.data;

                        var self = this;

                        self.onNewComment = function(comment){
                            if (photo.photo_id == comment.photo_id) {
                                $scope.data.comments.push(comment);
                                setTimeout(function(){
                                    var $comments = $(".comments");
                                    $comments.animate({ scrollTop: 1000 }, "slow");
                                }, 200);
                            }
                        };

                        self.onCommentDeleted = function(commentId){
                            for (var i = 0; i < $scope.data.comments.length; i++){
                                var c = $scope.data.comments[i];
                                if (c.comment_id == commentId){
                                    $scope.data.comments.splice(i, 1);
                                    break;
                                }
                            }
                        };

                        $scope.deleteComment = function(comment){
                            appState.deleteComment(comment.comment_id, function(success){

                            });
                        };

                        appState.addCommentsCallback(self);

                        $scope.closePhoto = function () {
                            appState.removeCommentsCallback(self);
                            $mdDialog.hide();
                        };

                        $scope.sendComment = function () {
                            if ($scope.commentText.trim() != ''){
                                appState.sendComment(photo.photo_id, $scope.commentText, function(success){
                                   if (success)
                                        $scope.commentText = '';
                                });
                            }
                        };

                    }
                }
            );
        });
    };

    window.onscroll = function(ev) {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
            $scope.loadMorePhotos();
        }
    };

    if ($(document).height() == $(window).height()){
        $scope.loadMorePhotos();
    }

}]);