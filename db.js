/*
 * The MIT License
 *
 * Copyright (c) 2016 Andreas Schattney
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

function SqlConnection() {

    var self = this;
    self.path = require('path');
    self.mysql = require('mysql');
    self.fs = require('fs');
    self.async = require('async');

    var dbConfig = require('./config').db;
    self.pool = self.mysql.createPool(dbConfig);

    SqlConnection.prototype.openConnection = function(callback) {
        self.pool.getConnection(function (error, connection) {
            callback(error, connection);
        });
    };

    SqlConnection.prototype.getComments = function(connection, photoId, installationId, invalidPhotoIdCallback, callback){
        self.photoExists(connection, photoId, function(exists){
           if (exists){
               var query = 'SELECT comment_id, installation_id, message FROM comment WHERE photo_id = ?';
               connection.query(query, [photoId], function(err,response) {
                   if (err) {
                       connection.release();
                       throw err;
                   } else {
                       self.async.forEachOf(response, self.async.apply(modifyDeletable, installationId), function(err){
                           if (err) {
                               connection.release();
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
            if (err) {
                connection.release();
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

    SqlConnection.prototype.getPhotoId = function(connection, commentId, callback){
        var query = 'SELECT photo_id FROM comment WHERE comment_id = ?';
        connection.query(query, [commentId], function(err, response){
            if (err){
                connection.release();
                throw err;
            }else{
                if (response.length > 0) {
                    callback(response[0].photo_id);
                }else{
                    callback(0);
                }
            }
        });
    };

    SqlConnection.prototype.getCommentCount = function(connection, photoId, callback){
        var query = 'SELECT COUNT(*) as comment_count FROM comment WHERE photo_id = ?';
        connection.query(query, [photoId], function(err, response){
           if (err){
               connection.release();
               throw err;
           }else{
               var comment_count = response[0].comment_count;
               callback(comment_count);
           }
        });
    };

    SqlConnection.prototype.getComment = function(connection, commentId, installationId, callback){
        var query = 'SELECT * FROM comment WHERE comment_id = ?';
        connection.query(query, [commentId], function(err,response) {
            if (err) {
                callback(undefined);
                throw err;
            } else {
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

    SqlConnection.prototype.search = function(connection, installationId, query, maxPhotoId, items_per_page, callback){
        var q = "%" + query + "%";
        var query = 'SELECT p.photo_id, p.installation_id, p.comment FROM photo p WHERE p.photo_id < ? AND p.comment LIKE ? ORDER BY p.photo_id DESC LIMIT ' + items_per_page;
        connection.query(query, [maxPhotoId, q], function(err, response){
            if (err) {
                connection.release();
                throw err;
            }else{
                processPhotoResult(connection, installationId, response, callback);
            }
        });
    };

    SqlConnection.prototype.getPhotos = function(connection, installationId, lastPhotoId, items_per_page, callback) {

        var query = 'SELECT p.photo_id, p.installation_id, p.comment FROM photo p WHERE p.photo_id < ? ORDER BY p.photo_id DESC LIMIT ' + items_per_page;

        connection.query(query, [lastPhotoId], function(err, response){
            if (err) {
                connection.release();
                throw err;
            }else{
                processPhotoResult(connection, installationId, response, callback);
            }
        });
    };

    SqlConnection.prototype.getPhoto = function(connection, photoId, callback){
        var query = 'SELECT p.photo_id, p.installation_id, p.comment, COALESCE(v.favorite, 0) AS favorite FROM photo p lEFT JOIN installationid_votes v ON p.photo_id = v.photo_id AND p.installation_id = v.installation_id WHERE p.photo_id = ?';
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
                callback(photoId);
            }
        });
    };

    SqlConnection.prototype.getPhotoContent = function(connection, photoId, callback){
        var query = 'SELECT image FROM photo WHERE photo_id = ?';
        connection.query(query, [photoId], function(err, response){
           if (err){
               connection.release();
               throw err;
           }else{
               if (response.length > 0){
                   callback(response[0].image);
               }
           }
        });
    };

    SqlConnection.prototype.isPhotoLiked = function(connection, installationId, photoId, callback){
        var query = "SELECT favorite FROM installationid_votes WHERE installation_id = ? AND photo_id = ?";
        connection.query(query, [installationId, photoId], function(err, response){
            if (err){
                throw err;
            }else{
                callback((response.length > 0 && response[0].favorite == 1));
            }
        });
    };

    SqlConnection.prototype.likePhoto = function(connection, installationId, photoId, callback){
        likeOrDislikePhoto(connection, installationId, photoId, 1, callback);
    };

    SqlConnection.prototype.dislikePhoto = function(connection, installationId, photoId, callback){
        likeOrDislikePhoto(connection, installationId, photoId, 0, callback);
    };

    function likeOrDislikePhoto(connection, installationId, photoId, amount, callback){
        var query = 'REPLACE INTO installationid_votes SET favorite = ? , photo_id = ? , installation_id = ?';
        connection.query(query, [amount, photoId, installationId], function(err, response) {
            if (err) {
                connection.release();
                throw err;
            }else{
                callback();
            }
        });
    };

    function modifyDeletable(installationId, photo, key, callback){
        photo.deleteable = photo.installation_id == installationId;
        delete photo.installation_id;
        callback();
    }

    function injectAmountOfComments(connection, photo, key, callback){
        var query = 'SELECT COUNT(*) AS amount FROM comment WHERE photo_id = ?';
        connection.query(query, [photo.photo_id], function(err,response){
            if (err){
                connection.release();
                throw err;
            }else{
                photo.comment_count = response !== undefined && response.length > 0 ? response[0].amount : 0;
                callback();
            }
        });
    }

    function injectFavorites(connection, installation_id, photo, key, callback){
        var query = "SELECT favorite from installationid_votes WHERE photo_id = ? AND installation_id = ?";
        connection.query(query, [photo.photo_id, installation_id], function(err,response){
            if (err){
                connection.release();
                throw err;
            }else{
                if (response !== undefined && response.length > 0){
                    photo.favorite = response[0].favorite;
                }else{
                    photo.favorite = 0;
                }
                callback();
            }
        });
    }

    function processPhotoResult(connection, installationId, response, callback) {
        self.async.forEachOf(response, self.async.apply(modifyDeletable, installationId), function (err) {
            if (err) {
                connection.release();
                throw err;
            } else {
                self.async.forEachOf(response, self.async.apply(injectAmountOfComments, connection), function (err) {
                    if (err) {
                        connection.release();
                        throw err;
                    } else {
                        self.async.forEachOf(response, self.async.apply(injectFavorites, connection, installationId), function (err) {
                            if (err) {
                                connection.release();
                                throw err;
                            } else {
                                callback(response);
                            }
                        });
                    }
                });
            }
        });
    }
}

module.exports = new SqlConnection();