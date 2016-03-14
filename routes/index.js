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

module.exports = function(app, io) {

  var express = require('express');
  var db = require('../db');

  /* GET home page. */
  app.get('/', function (req, res, next) {
    res.render('index', {title: 'Express'});
  });

  app.get('/photostream/stream', function (req, res) {
    var page = req.query.page;
    if (page == undefined || page == ''){
      res.status(401).json({ response_code: 401, message: 'missing parameter: page'});
      return;
    }
    var installationId = req.header('installation_id');
    db.openConnection(function (err, connection) {
      if (err) throw err;
      db.getPhotos(connection, installationId, page, function (response) {
        res.json({photos: response, page: page});
      });
    });
  });

  app.get('/photostream/search', function(req, res){
    var query = req.query.q;
    var page = req.query.page;
    if (query === undefined || query.trim() == ''){
      res.status(401).json({ response_code: 401, message: 'missing parameter: q'});
    }else if (page === undefined || page.trim() == ''){
      res.status(401).json({ response_code: 401, message: 'missing parameter: page'});
    }else{
      var installationId = req.header('installation_id');
      db.openConnection(function(err, connection){
        if (err)
          throw err;
        else{
          db.search(connection, installationId, query, page, function(response){
            res.json({photos: response, page: page});
          });
        }
      });
    }
  });

  app.get('/photostream/popular', function (req, res) {
    var page = req.query.page;
    if (page == undefined || page == ''){
      res.status(401).json({ response_code: 401, message: 'missing parameter: page'});
      return;
    }
    var installationId = req.header('installation_id');
    db.openConnection(function (err, connection) {
      if (err) throw err;
      db.getPopularPhotos(connection, installationId, page, function (response) {
        res.json({photos: response, page: page});
      });
    });
  });

  app.post('/photostream/image', function (req, res) {
    var installationId = req.header('installation_id');
    var obj = req.body;
    db.openConnection(function (err, connection) {
      if (err) throw err;
      db.storePhoto(connection, installationId, obj, function (photoId) {
        if (photoId !== undefined && photoId > 0){
          db.openConnection(function(err, connection){
            if (err){
              throw err;
            }else{
              db.getPhoto(connection, photoId, function(response){
                var photo = response !== undefined && response.length > 0 ? response[0] : undefined;
                photo.deleteable = true;
                res.json(photo);
                delete photo.deleteable;
                io.webSocket.emit(installationId, 'new_photo', photo);
              });
            }
          });
        }else{
          res.status(500).end();
        }
      });
    });
  });

  app.post('/photostream/image/:id/comment', function (req, res) {

    var installationId = req.header('installation_id');
    var photoId = req.params.id;

    function invalidPhotoIdCallback(){
      res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
    }

    db.openConnection(function (err, connection) {
      if (err) {
        throw err;
      } else {
        var comment = req.body;
        db.storeComment(connection, photoId, installationId, comment, invalidPhotoIdCallback, function (comment) {
          if (comment !== undefined){
            res.status(200).json(comment);
            comment.deleteable = false;
            io.webSocket.emit(installationId, 'new_comment', comment);
          }else{
            res.status(500).json({ response_code: 500, message: 'unknown error'});
          }
        });
      }
    });
  });

  app.delete('/photostream/comment/:comment_id', function (req, res) {
    var installationId = req.header('installation_id');
    var commentId = req.params.comment_id;
    db.openConnection(function (err, connection) {
      if (err) {
        throw err;
      } else {
        db.deleteComment(connection, commentId, installationId, function (affectedRows) {
          if (affectedRows > 0){
            res.status(200).end();
            io.webSocket.emit(installationId, "comment_deleted", commentId);
          }else{
            res.status(404).json( { response_code: 404, message: 'comment not found', comment_id: commentId});
          }
        });
      }
    });
  });

  app.delete('/photostream/image/:id', function (req, res) {
    var installationId = req.header('installation_id');
    var photoId = req.params.id;
    db.openConnection(function (err, connection) {
      if (err) {
        throw err;
      } else {
        db.deletePhoto(connection, photoId, installationId, function (affectedRows) {

          var responseStatus = affectedRows > 0 ? 200 : 404;
          var responseJson = { response_code: responseStatus, photo_id: photoId}

          if (affectedRows <= 0){
            responseJson.message = 'photo not found';
          }

          res.status(responseStatus).json(responseJson);

          if (affectedRows > 0)
            io.webSocket.emit(installationId, 'photo_deleted', photoId);
        });
      }
    });
  });

  app.get('/photostream/image/:id/comments', function (req, res) {

    function invalidPhotoIdCallback(){
      res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
    }

    var installation_id = req.header('installation_id');
    var photoId = req.params.id;
    db.openConnection(function (err, connection) {
      if (err) {
        throw err;
      } else {
        db.getComments(connection, photoId, installation_id, invalidPhotoIdCallback, function (comments) {
          res.json({photo_id: photoId, comments: comments});
        });
      }
    });
  });

  app.put('/photostream/image/:id/upvote', function (req, res) {

    var installationId = req.header('installation_id');
    var photoId = req.params.id;

    function notAllowedCallback(voteCount) {
      res.status(200).json({photo_id: photoId, votecount: voteCount, already_voted: true});
    }

    db.openConnection(function (err, connection) {
      if (err)
        throw err;
      else{
        db.photoExists(connection, photoId, function(exists){
          if (exists){
            db.upvotePhoto(connection, installationId, photoId, notAllowedCallback, function (newVoteCount) {
              var vote = {photo_id: photoId, votecount: newVoteCount};
              res.json(vote);
              io.webSocket.emit(installationId, 'new_vote', vote);
            });
          }else{
            res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
          }
        });
      }
    })
  });

  app.put('/photostream/image/:id/downvote', function (req, res) {

    var installationId = req.header('installation_id');
    var photoId = req.params.id;

    function notAllowedCallback(voteCount) {
      res.status(200).json({photo_id: photoId, votecount: voteCount, already_voted: true});
    }

    db.openConnection(function (err, connection) {
      if (err)
        throw err;
      else{
        db.photoExists(connection, photoId, function(exists) {
          if (exists) {
            db.downvotePhoto(connection, installationId, photoId, notAllowedCallback, function (newVoteCount) {
              var vote = {photo_id: photoId, votecount: newVoteCount};
              res.json(vote);
              io.webSocket.emit(installationId, 'new_vote', vote);
            });
          }else{
            res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
          }
        });
      }
    })
  });

};