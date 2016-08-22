angular.module('App').controller('AppController', ['$scope', '$mdDialog', '$http', 'photoStreamService', function ($scope, $mdDialog, $http, photoStreamService) {

    $scope.data = photoStreamService.data;

    $scope.loadMorePhotos = function () {
        if (!$scope.data.isLoadingPhotos) {
            $scope.data.isLoadingPhotos = true;
            photoStreamService.loadMorePhotos(function () {
                $scope.data.isLoadingPhotos = false;
                setTimeout(function(){
                    if ($(document).height() <= $(window).height()) {
                        $scope.loadMorePhotos();
                    }
                }, 0);
            });
        }
    };

    $scope.showPhotoInModal = function ($event, index) {
        $event.stopPropagation();
        var cssLeft = 0;
        var cssTop = 0;
        function onDialogShowing() {
            var $container = $('.md-dialog-container');
            $container.css('display', 'block');
            var $dialog = $('md-dialog');
            $container.css('display', 'block');
            var windowHeight = $(window).height();
            var windowWidth = $(window).width();
            var imageHeight = $('.md-card-image').height();
            var imageWidth = $('.md-card-image').width();
            var a = (imageHeight - windowHeight) > (imageWidth - windowWidth);
            if (a && imageHeight > windowHeight)
                $('.md-card-image').height((windowHeight * 0.95) + "px");
            else if (!a && imageWidth > windowWidth)
                $('.md-card-image').width((windowWidth * 0.95) + "px");
            $dialog.css('left', cssLeft + "px");
            $dialog.css('top', cssTop + "px");
            $container.hide().fadeIn(200);
            $dialog.hide().fadeIn(200);
        };


        $scope.data.currentPhoto = $scope.data.photos[index];

        var p = {
            parent: angular.element(document.body),
            templateUrl: '/javascripts/template/image-dialog.html',
            hasBackdrop: false,
            controller: function($scope, $mdDialog){
                $scope.data = photoStreamService.data;
            },
            onComplete: function (){
                var windowHeight = $(window).height();
                var windowWidth = $(window).width();
                var imageHeight = $('.md-card-image').height();
                var imageWidth = $('.md-card-image').width();
                var a = (imageHeight - windowHeight) > (imageWidth - windowWidth);
                if (a && imageHeight > windowHeight)
                    $('.md-card-image').height((windowHeight * 0.95) + "px");
                else if (!a && imageWidth > windowWidth)
                    $('.md-card-image').width((windowWidth * 0.95) + "px");
                var dialogHeight = $('md-dialog').height();
                var dialogWidth = $('md-dialog').width();
                cssLeft = $(window).width() / 2 - dialogWidth / 2;
                cssTop =  ($(window).height() / 2 - dialogHeight / 2);
                $mdDialog.hide();
            },
            onRemoving: function(){
                $mdDialog.show({
                    parent: angular.element(document.body),
                    templateUrl: '/javascripts/template/image-dialog.html',
                    clickOutsideToClose : true,
                    onComplete: onDialogShowing,
                    controller: function ModalController($scope, $mdDialog) {
                        $scope.commentText = '';
                        $scope.data = photoStreamService.data;

                        $scope.closePhoto = function () {
                            $mdDialog.hide();
                        };
                    }
                });
            }
        };
        $mdDialog.show(p);
    };

    $scope.deletePhoto = function (photo) {
        photoStreamService.deletePhoto(photo.photo_id, function (success) {
            if ($(document).height() <= $(window).height()) {
                $scope.loadMorePhotos();
            }
        });
    };

    $scope.showPhoto = function (photo) {

        photoStreamService.loadComments(photo.photo_id, function () {

            function onDialogShowing() {
                $('.md-errors-spacer').remove();
                var $dialog = $('.custom-dialog');
                var $container = $('.md-dialog-container');
                var $img = $('.img-dialog');
                var parentWidth = $img.parent().width();
                var imgWidth = $img.width();
                $img.css('margin-left', ((parentWidth-imgWidth) / 2) + 15 + "px");
                $container.css('display', 'block');
                $container.hide().fadeIn(200);
                $dialog.hide().fadeIn(200);
            }

            $mdDialog.show({
                    parent: angular.element(document.body),
                    templateUrl: '/javascripts/template/dialog.html',
                    onComplete: onDialogShowing,
                    controller: function DialogController($scope, $mdDialog) {
                        $scope.commentText = '';
                        $scope.data = photoStreamService.data;

                        var self = this;

                        self.onNewComment = function (comment) {
                            if (photo.photo_id == comment.photo_id) {
                                $scope.data.comments.push(comment);
                                setTimeout(function () {
                                    var $comments = $(".comments");
                                    $comments.animate({scrollTop: 1000}, "slow");
                                }, 200);
                            }
                        };

                        self.onCommentDeleted = function (commentId) {
                            for (var i = 0; i < $scope.data.comments.length; i++) {
                                var c = $scope.data.comments[i];
                                if (c.comment_id == commentId) {
                                    $scope.data.comments.splice(i, 1);
                                    break;
                                }
                            }
                        };

                        $scope.deleteComment = function (comment) {
                            photoStreamService.deleteComment(comment.comment_id, function (success) {

                            });
                        };

                        photoStreamService.addCommentsCallback(self);

                        $scope.closePhoto = function () {
                            photoStreamService.removeCommentsCallback(self);
                            $mdDialog.hide();
                        };

                        $scope.sendComment = function () {
                            if ($scope.commentText.trim() != '') {
                                photoStreamService.sendComment(photo.photo_id, $scope.commentText, function (success) {
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

    function OnScroll(ev){
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
            if (!$scope.data.isLoadingPhotos)
                $scope.loadMorePhotos();
        }
    }

    window.onscroll = OnScroll;

    $scope.loadPhotos = function () {
        $scope.data.isLoadingPhotos = true;
        photoStreamService.loadPhotos(function () {
            $scope.data.isLoadingPhotos = false;
            setTimeout(function () {
                OnScroll();
            }, 0);
        });
    };

    $scope.loadPhotos();

}]);