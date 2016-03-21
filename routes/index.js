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

  var cache = require('memory-cache');
  var etag = require('etag');
  const CACHE_TIMEOUT = 3600 * 1000;
  const STREAM_PREFIX = "stream_";
  const SEARCH_PREFIX = "search_";
  var express = require('express');
  var db = require('../db');

  function sendErrorIfNAN(value, name, res){
    if (isNaN(value)){
      res.status(401).json({ response_code : 401, message: name + ' must be a number but value is: ' + value});
      return true;
    }else{
      return false;
    }
  }

  /* GET home page. */
  app.get('/', function (req, res, next) {
    res.render('index', {title: 'Express'});
  });

  app.get('/photostream/stream/more', function(req, res){
    var installationId = req.header('installation_id');
    doGetPhotos(installationId, undefined, req, res);
  });

  app.get('/photostream/stream', function (req, res) {
    var installationId = req.header('installation_id');
    doGetPhotos(installationId, 1, req, res);
  });

  function queryETagForFirstPageOfStream(installationId, callback){

    db.openConnection(function (err, connection) {
      if (err)
        throw err;
      else{
        var page = 1;
        db.getPhotos(connection, installationId, page, function (response) {
          var hasNextPage = response !== undefined && response.length > 0;
          var jsonResponse = {photos: response, page: page, has_next_page: hasNextPage};
          var hash = etag(JSON.stringify(jsonResponse));
          callback(hash);
        });
      }
    });

  }

  function doGetPhotos(installationId, page, req, res){

    if (page !== undefined && page == 1){
      cache.put(STREAM_PREFIX + installationId, 1, CACHE_TIMEOUT); // Time in ms
    }else{
      page = cache.get(STREAM_PREFIX + installationId);
      if (page == null){
        res.status(401).json({ response_code: 401, message: 'please use /stream endpoint first'});
        return;
      }
    }

    db.openConnection(function (err, connection) {
      if (err)
        throw err;
      else{
        db.getPhotos(connection, installationId, page, function (response) {
          if (response.length > 0) {
            db.openConnection(function (err, connection) {
              if (err)
                throw err;
              else {
                db.getPhotos(connection, installationId, page + 1, function (response_next_page) {
                  cache.put(STREAM_PREFIX + installationId, cache.get(STREAM_PREFIX + installationId) + 1, CACHE_TIMEOUT);
                  var hasNextPage = response_next_page !== undefined && response_next_page.length > 0;
                  var jsonResponse = {photos: response, page: page, has_next_page: hasNextPage};

                  if (page == 1){
                    var ifModifiedSince = req.header('if-modified-since');
                    var hash = etag(JSON.stringify(jsonResponse));
                    if (ifModifiedSince === undefined || ifModifiedSince === null || ifModifiedSince != hash) {
                      res.setHeader('ETag', hash);
                      res.json(jsonResponse)
                    }else{
                      res.status(304).end();
                    }
                  }else{
                    res.json(jsonResponse);
                  }

                });
              }
            });
          }else{
            cache.put(STREAM_PREFIX + installationId, cache.get(STREAM_PREFIX + installationId) + 1, CACHE_TIMEOUT);
            var jsonResponse = {photos: response, page: page, has_next_page: false};

            if (page == 1){
              var ifModifiedSince = req.header('if-modified-since');
              var hash = etag(JSON.stringify(jsonResponse));
              if (ifModifiedSince === undefined || ifModifiedSince === null || ifModifiedSince != hash) {
                res.setHeader('ETag', hash);
                res.json(jsonResponse)
              }else{
                res.status(304).end();
              }
            }else{
              res.json(jsonResponse);
            }

          }
        });
      }
    });

  }

  app.get('/photostream/search/more', function(req, res){
    var installationId = req.header('installation_id');
    doSearch(installationId, undefined, undefined, res);
  });

  app.get('/photostream/search', function(req, res){

    var query = req.query.q;
    var installationId = req.header('installation_id');
    if (query === undefined || query.trim() == ''){
      res.status(401).json({ response_code: 401, message: 'missing or invalid parameter: q'});
      return;
    }

    doSearch(installationId, query, 1, res);

  });

  function doSearch(installationId, query, page, res){

    if (query === undefined){
      var obj = cache.get(SEARCH_PREFIX + installationId);
      if (obj == null){
        res.status(401).json({ response_code: 401, message: 'please use /search endpoint first'});
        return;
      }
      query = obj.query;
      page = obj.page;
    }else{
      var obj = {};
      obj.query = query;
      obj.page = page;
      cache.put(SEARCH_PREFIX + installationId, obj, CACHE_TIMEOUT);
    }

    db.openConnection(function(err, connection){
      if (err)
        throw err;
      else{
        db.search(connection, installationId, query, page, function(response){
          if (response.length > 0) {
            db.openConnection(function (err, connection) {
              db.search(connection, installationId, query, page + 1, function (response_next_page) {
                var hasNextPage = response_next_page !== undefined && response_next_page.length > 0;
                var obj = cache.get(SEARCH_PREFIX + installationId);
                obj.page = parseInt(obj.page) + 1;
                cache.put(SEARCH_PREFIX + installationId, obj, CACHE_TIMEOUT);
                res.json({photos: response, page: page, has_next_page: hasNextPage});
              });
            });
          }else{
            var obj = cache.get(SEARCH_PREFIX + installationId);
            obj.page = parseInt(obj.page) + 1;
            cache.put(SEARCH_PREFIX + installationId, obj, CACHE_TIMEOUT);
            res.json({photos: response, page: page, has_next_page: false});
          }
        });
      }
    });

  }

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
                queryETagForFirstPageOfStream(installationId, function(hash){
                  res.setHeader('ETag', hash);
                  photo.deleteable = true;
                  res.json(photo);
                  delete photo.deleteable;
                  delete photo.etag;
                  io.webSocket.emit(installationId, 'new_photo', photo);
                });
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

    if (sendErrorIfNAN(photoId, 'photo id', res))
      return;

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

    if (sendErrorIfNAN(commentId, 'comment id', res))
      return;

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

    if (sendErrorIfNAN(photoId, 'photo id', res))
      return;

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

    if (sendErrorIfNAN(photoId, 'photo id', res))
      return;

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

  app.put('/photostream/image/:id/like', function (req, res) {

    var installationId = req.header('installation_id');
    var photoId = req.params.id;

    db.openConnection(function (err, connection) {
      if (err)
        throw err;
      else{
        db.photoExists(connection, photoId, function(exists){
          if (exists){
            db.likePhoto(connection, installationId, photoId, function () {
              var like = {photo_id: photoId, favorite: true};
              res.json(like);
            });
          }else{
            res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
          }
        });
      }
    })
  });

  app.put('/photostream/image/:id/dislike', function (req, res) {

    var installationId = req.header('installation_id');
    var photoId = req.params.id;

    if (sendErrorIfNAN(photoId, 'photo id', res))
      return;

    db.openConnection(function (err, connection) {
      if (err)
        throw err;
      else{
        db.photoExists(connection, photoId, function(exists) {
          if (exists) {
            db.dislikePhoto(connection, installationId, photoId, function () {
              var dislike = {photo_id: photoId, favorite: false};
              res.json(dislike);
            });
          }else{
            res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
          }
        });
      }
    })
  });

};