function SqlConnection() {

    const ITEMS_PER_PAGE = 5;

    var self = this;
    self.INVALID_POSITION = -200;
    self.path = require('path');
    self.mysql = require('mysql');
    self.fs = require('fs');
    self.async = require('async')
    self.uuid = require('node-uuid');

    SqlConnection.pool = self.mysql.createPool(require('./config'));

    SqlConnection.prototype.openConnection = function(callback) {
        SqlConnection.pool.getConnection(function (error, connection) {
            callback(error, connection);
        });
    };

    SqlConnection.prototype.getComments = function(connection, photoId, installationId, invalidPhotoIdCallback, callback){
        self.photoExists(connection, photoId, function(exists){
           if (exists){
               var query = 'SELECT comment_id, installation_id, message FROM comment WHERE photo_id = ?';
               connection.query(query, [photoId], function(err,response) {
                   connection.release();
                   if (err) {
                       throw err;
                   } else {
                       self.async.forEachOf(response, self.async.apply(modifyDeletable, installationId), function(err){
                           if (err) {
                               throw err;
                           }else{
                               callback(response);
                           }
                       });
                   }
               });
           }else{
               connection.release();
               invalidPhotoIdCallback();
           }
        });
    };

    SqlConnection.prototype.deletePhoto = function(connection, photoId, installationId, callback) {
        var query = 'DELETE FROM photo WHERE photo_id = ? AND installation_id = ?';
        connection.query(query, [photoId, installationId], function(err, response) {
            connection.release();
            if (err) {
                throw err;
            }else{
                var affectedRows = response.affectedRows;
                callback(affectedRows);
            }
        });
    };

    SqlConnection.prototype.deleteComment = function(connection, commentId, installationId, callback){
        var query = 'DELETE FROM comment WHERE comment_id = ? AND installation_id = ?';
        connection.query(query, [commentId, installationId], function(err, response){
            if (err) {
                connection.release();
                throw err;
            }else {
                var affectedRows = response.affectedRows;
                connection.release();
                callback(affectedRows);
            }
        });
    };

    SqlConnection.prototype.photoExists = function(connection, photoId, callback){
        var query = "SELECT COUNT(*) AS amount FROM photo WHERE photo_id = ?";
        connection.query(query, [photoId], function(err, response) {
            if (err) {
                connection.release();
                throw err;
            }else{
                callback(response[0].amount == 1);
            }
        });
    };

    SqlConnection.prototype.storeComment = function(connection, photoId, installationId, commentObject, invalidPhotoIdCallback, callback){
        self.photoExists(connection, photoId, function(exists){
            if (exists) {
                var comment = commentObject.message;
                var query = 'INSERT INTO comment (photo_id, installation_id, message) VALUES (?, ?, ?)';
                connection.query(query, [photoId, installationId, comment], function (err, response) {
                    if (err) {
                        connection.release();
                        callback(0);
                        throw err;
                    } else {
                        var commentId = response.insertId;
                        self.getComment(connection, commentId, installationId, callback);
                    }
                });
            }else{
                connection.release();
                invalidPhotoIdCallback();
            }
        });
    };

    SqlConnection.prototype.getComment = function(connection, commentId, installationId, callback){
        var query = 'SELECT * FROM comment WHERE comment_id = ?';
        connection.query(query, [commentId], function(err,response) {
            connection.release();
            if (err) {
                callback(undefined);
                throw err;
            } else {
                modifyDeletable
                var comment = response.length > 0 ? response[0] : undefined;
                if (comment !== undefined) {
                    modifyDeletable(installationId, comment, 0, function () {
                        callback(comment);
                    });
                }else{
                    callback(comment);
                }
            }
        });
    };

    SqlConnection.prototype.getPopularPhotos = function(connection, installationId, page, callback){
        var offset = (page * ITEMS_PER_PAGE) - ITEMS_PER_PAGE;
        var query = 'SELECT p.photo_id, p.installation_id, p.image, p.comment, v.votecount FROM photo p JOIN votes v ON p.photo_id = v.photo_id ORDER BY v.votecount DESC LIMIT 5 OFFSET ?';
        connection.query(query, [offset], function(err, response){
            if (err) {
                connection.release();
                throw err;
            }else{
                processPhotoResult(connection, installationId, response, callback);
            }
        });
    };

    SqlConnection.prototype.search = function(connection, installationId, query, page, callback){
        var q = "%" + query + "%";
        var offset = (page * ITEMS_PER_PAGE) - ITEMS_PER_PAGE;
        var query = 'SELECT p.photo_id, p.installation_id, p.image, p.comment, v.votecount FROM photo p JOIN votes v ON p.photo_id = v.photo_id WHERE p.comment LIKE ? ORDER BY v.votecount DESC LIMIT 5 OFFSET ?';
        connection.query(query, [q, offset], function(err, response){
            if (err) {
                connection.release();
                throw err;
            }else{
                processPhotoResult(connection, installationId, response, callback);
            }
        });
    };

    function processPhotoResult(connection, installationId, response, callback){
        self.async.forEachOf(response, self.async.apply(modifyDeletable, installationId), function(err){
            connection.release();
            if (err){
                throw err;
            }else {
                callback(response);
            }
        });
    };

    SqlConnection.prototype.getPhotos = function(connection, installationId, page, callback) {

        var offset = (page * ITEMS_PER_PAGE) - ITEMS_PER_PAGE;
        var query = 'SELECT p.photo_id, p.installation_id, p.image, p.comment, v.votecount FROM photo p JOIN votes v ON p.photo_id = v.photo_id ORDER BY p.photo_id DESC LIMIT 5 OFFSET ?';

        connection.query(query, [offset], function(err, response){
            if (err) {
                connection.release();
                throw err;
            }else{
                processPhotoResult(connection, installationId, response, callback);
            }
        });
    };

    function modifyDeletable(installationId, photo, key, callback){
        photo.deleteable = photo.installation_id == installationId;
        delete photo.installation_id;
        callback();
    }

    SqlConnection.prototype.getPhoto = function(connection, photoId, callback){
        var query = 'SELECT p.photo_id, p.installation_id, p.image, p.comment, v.votecount FROM photo p JOIN votes v ON p.photo_id = v.photo_id WHERE p.photo_id = ?';
        connection.query(query, [photoId], function(err,response){
            if (err){
                connection.release();
                throw err;
            }else{
                processPhotoResult(connection, undefined, response, callback);
            }
        });
    };

    SqlConnection.prototype.storePhoto = function(connection, installationId, photo, callback){
        var query = 'INSERT INTO photo (image, installation_id, comment) VALUES (?, ?, ?)';
        connection.query(query, [photo.image, installationId, photo.comment], function (err, response) {
            if (err) {
                connection.release();
                throw err;
            }else {
                var photoId = response.insertId;
                self.storeVote(connection, photoId, function(photoId){
                    connection.release();
                    callback(photoId);
                });
            }
        });
    };

    function votePhoto(connection, installationId, photoId, amount, callback){
        var vote = amount == 1 ? 'votecount + 1' : 'votecount - 1';
        var query = 'UPDATE votes SET votecount = ' + vote + ' WHERE photo_id = ?';
        connection.query(query, [photoId], function(err, response) {
            if (err) {
                connection.release();
                throw err;
            }else {
                //self.getVoteCount(connection, photoId, callback);
                insertVoteForInstallationId(connection, photoId, installationId, amount == 1 ? 1 : -1, callback);
            }
        });
    };

    function insertVoteForInstallationId(connection, photoId, installationId, vote, callback){
        var query = 'INSERT INTO installationid_votes (installation_id, photo_id, vote) VALUES (?, ?, ?)';
        connection.query(query, [installationId, photoId, vote], function(err, response) {
            if (err) {
                connection.release();
                throw err;
            }else {
                self.getVoteCount(connection, photoId, callback);
            }
        });
    }

    SqlConnection.prototype.voteAllowed = function(connection, installationId, photoId, callback){
        var query = "SELECT COUNT(*) AS amount FROM installationid_votes WHERE installation_id = ? AND photo_id = ?";
        connection.query(query, [installationId, photoId], function(err, response){
            if (err){
                throw err;
            }else{
                callback(response[0].amount == 0);
            }
        });
    };

    SqlConnection.prototype.upvotePhoto = function(connection, installationId, photoId, notAllowedCallback, callback){
        self.voteAllowed(connection, installationId, photoId, function(allowed){
           if (allowed)
               votePhoto(connection, installationId, photoId, 1, callback);
            else
               self.getVoteCount(connection, photoId, notAllowedCallback);
        });
    };

    SqlConnection.prototype.downvotePhoto = function(connection, installationId, photoId, notAllowedCallback, callback){
        self.voteAllowed(connection, installationId, photoId, function(allowed){
            if (allowed)
                votePhoto(connection, installationId, photoId, -1, callback);
            else
                self.getVoteCount(connection, photoId, notAllowedCallback);
        });
    };

    SqlConnection.prototype.getVoteCount = function(connection, photoId, callback){
        var query = 'SELECT votecount FROM votes WHERE photo_id = ?';
        connection.query(query, [photoId], function(err, response){
            connection.release();
           if (err){
               throw err;
           }else{
               callback(response[0].votecount);
           }
        });

    };

    SqlConnection.prototype.storeVote = function(connection, photoId, callback){
        var query = 'INSERT INTO votes (photo_id, votecount) VALUES (?, ?)';
        connection.query(query, [photoId, 0], function(err, response) {
            if (err) {
                connection.release();
                throw err;
            }else {
                callback(photoId);
            }
        });
    };

}

module.exports = new SqlConnection();