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

  const API_URL = "/photostream/api/";

  var etag = require('etag');
  const STREAM_PREFIX = "stream_";
  const MAX_PHOTO_ID_PREFIX = "max_photo_id_";
  const MAX_PHOTO_ID = 1000000;
  const SEARCH_PREFIX = "search_";
  const MAX_COMMENT_LENGTH = 150;
  const DEFAULT_ITEMS_PER_PAGE = 5;

  var cluster = require('cluster');
  var express = require('express');
  var db = require('../db');
  var redis = require('redis'), client = redis.createClient({db: 1});
  /**
   * renders the photostream homepage
   */
  app.get('/photostream', function (req, res, next) {
    res.render('index', { });
  });

  /**
   * renders the photostream homepage
   */
  app.get('/photostream/stream', function (req, res, next) {
    res.render('index', { });
  });

  app.get(API_URL + 'stream', function (req, res) {
    var installationId = req.header('installation_id');
    var photos_per_page = req.query['page_size'];
    var initial = req.query['initial_load'] == 1;
    if (photos_per_page === undefined || photos_per_page == null)
      photos_per_page = DEFAULT_ITEMS_PER_PAGE;

    doGetPhotos(installationId, 1, MAX_PHOTO_ID, photos_per_page, initial, req, res);
  });

  app.get(API_URL + 'stream/more', function(req, res){
    var installationId = req.header('installation_id');
    var photos_per_page = req.query['page_size'];
    if (photos_per_page === undefined || photos_per_page == null)
      photos_per_page = DEFAULT_ITEMS_PER_PAGE;

    doGetPhotos(installationId, undefined, undefined, photos_per_page, false, req, res);
  });

  app.get(API_URL + 'search', function(req, res){

    var query = req.query.q;
    var installationId = req.header('installation_id');
    if (query === undefined || query.trim() == ''){
      res.status(401).json({ response_code: 401, message: 'missing or invalid parameter: q'});
      return;
    }

    var photos_per_page = req.query['page_size'];
    if (photos_per_page === undefined || photos_per_page == null)
      photos_per_page = DEFAULT_ITEMS_PER_PAGE;

    doSearch(installationId, query, 1, MAX_PHOTO_ID, photos_per_page, res);

  });

  app.get(API_URL + 'search/more', function(req, res){
    var installationId = req.header('installation_id');
    var photos_per_page = req.query['page_size'];
    if (photos_per_page === undefined || photos_per_page == null)
      photos_per_page = DEFAULT_ITEMS_PER_PAGE;

    doSearch(installationId, undefined, undefined, undefined, photos_per_page, res);
  });


  app.post(API_URL + 'image', function (req, res) {

    var installationId = req.header('installation_id');

    var obj = req.body;
    db.openConnection(function (err, connection) {
      if (err) throw err;
      db.storePhoto(connection, installationId, obj, function (photoId) {
        if (photoId !== undefined && photoId > 0){
          db.getPhoto(connection, photoId, function(response){
            connection.release();
            var photo = response !== undefined && response.length > 0 ? response[0] : undefined;
            photo.deleteable = true;
            res.json(photo);
            delete photo.deleteable;
            io.webSocket.emit(installationId, 'new_photo', photo);
          });
        }else{
          connection.release();
          res.status(500).end();
        }
      });
    });
  });

  app.post(API_URL + 'image/:id/comment', function (req, res) {

    var installationId = req.header('installation_id');
    var photoId = req.params.id;

    if (sendErrorIfNAN(photoId, 'photo id', res))
      return;

    var comment = req.body;

    if (comment.message.trim().length > MAX_COMMENT_LENGTH){
      res.status(401).json( { response_code: 500, message: 'comment size of ' + MAX_COMMENT_LENGTH + ' characters exceeded' } );
      return;
    }

    function invalidPhotoIdCallback(){
      res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
    }

    db.openConnection(function (err, connection) {
      if (err) {
        throw err;
      } else {
        db.storeComment(connection, photoId, installationId, comment, invalidPhotoIdCallback, function (comment) {
          if (comment !== undefined){
            res.status(200).json(comment);
            comment.deleteable = false;
            io.webSocket.emit(installationId, 'new_comment', comment);
            db.getCommentCount(connection, photoId, function(commentCount){
              connection.release();
              io.webSocket.sockets.emit('new_comment_count', {photo_id : photoId, comment_count : commentCount});
            });
          }else{
            connection.release();
            res.status(500).json({ response_code: 500, message: 'internal server error'});
          }
        });
      }
    });
  });

  app.delete(API_URL + 'comment/:comment_id', function (req, res) {

    var installationId = req.header('installation_id');
    var commentId = req.params.comment_id;

    if (sendErrorIfNAN(commentId, 'comment id', res))
      return;

    db.openConnection(function (err, connection) {
      if (err) {
        throw err;
      } else {
        db.getPhotoId(connection, commentId, function(photoId){
            db.deleteComment(connection, commentId, installationId, function (affectedRows) {
              if (affectedRows > 0){
                res.status(200).end();
                io.webSocket.emit(installationId, "comment_deleted", commentId);
                db.getCommentCount(connection, photoId, function(commentCount){
                  connection.release();
                  io.webSocket.sockets.emit('new_comment_count', {photo_id : photoId, comment_count : commentCount});
                });
              }else{
                connection.release();
                res.status(404).json( { response_code: 404, message: 'comment not found', comment_id: commentId});
              }
            });
        });
      }
    });
  });

  app.delete(API_URL + 'image/:id', function (req, res) {

    var installationId = req.header('installation_id');
    var photoId = req.params.id;

    if (sendErrorIfNAN(photoId, 'photo id', res))
      return;

    db.openConnection(function (err, connection) {
      if (err) {
        throw err;
      } else {
        db.deletePhoto(connection, photoId, installationId, function (affectedRows) {
          connection.release();

          var responseStatus = affectedRows > 0 ? 200 : 404;
          var responseJson = { response_code: responseStatus, photo_id: photoId};

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

  app.get(API_URL + 'image/:id/comments', function (req, res) {

    function invalidPhotoIdCallback(){
      res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
    }

    var installation_id = req.header('installation_id');
    var ifModifiedSince = req.header('if-modified-since');
    var photoId = req.params.id;

    if (sendErrorIfNAN(photoId, 'photo id', res))
      return;

    db.openConnection(function (err, connection) {
      if (err) {
        throw err;
      } else {
        db.getComments(connection, photoId, installation_id, invalidPhotoIdCallback, function (comments) {
          connection.release();
          var response = {photo_id: photoId, comments: comments};
          var hash = etag(JSON.stringify(response));
          if (ifModifiedSince === undefined || ifModifiedSince === null || ifModifiedSince != hash) {
            res.setHeader('ETag', hash);
            res.json(response)
          }else{
            res.status(304).end();
          }
        });
      }
    });
  });

  app.put(API_URL + 'image/:id/like', function (req, res) {

    var installationId = req.header('installation_id');
    var photoId = req.params.id;

    db.openConnection(function (err, connection) {
      if (err)
        throw err;
      else{
        db.photoExists(connection, photoId, function(exists){
          if (exists){
            db.likePhoto(connection, installationId, photoId, function () {
              connection.release();
              var like = {photo_id: photoId, favorite: true};
              res.json(like);
            });
          }else{
            connection.release();
            res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
          }
        });
      }
    })
  });

  app.put(API_URL + 'image/:id/dislike', function (req, res) {

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
              connection.release();
              var dislike = {photo_id: photoId, favorite: false};
              res.json(dislike);
            });
          }else{
            connection.release();
            res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
          }
        });
      }
    })
  });

  app.get(API_URL + "image/:id/content", function(req, res){
    var photoId = req.params.id;

    if (sendErrorIfNAN(photoId, 'photo id', res))
      return;

    db.openConnection(function(err, connection){
      if(err)
        throw err;
      else{
        db.photoExists(connection, photoId, function(exists){
          if (exists){
            db.getPhotoContent(connection, photoId, function(content){
              connection.release();
              res.header('Content-Type', 'image/png');
              try{
                var buff = new Buffer(content, 'base64');
                res.send(buff);
              }catch(err){
                res.status(500).json( { response_code: 500, message: 'could not encode image' } );
              }
            });
          }else{
            connection.release();
            res.status(404).json( { response_code: 404, message: 'invalid photo id' } );
          }
        });
      }
    });

  });

  function sendErrorIfNAN(value, name, res){
    if (isNaN(value)){
      res.status(401).json({ response_code : 401, message: name + ' must be a number but value is: ' + value});
      return true;
    }else{
      return false;
    }
  }

  function queryETagForFirstPageOfStream(installationId, photos_per_page, callback){

    db.openConnection(function (err, connection) {
      if (err)
        throw err;
      else{
        db.getPhotos(connection, installationId, MAX_PHOTO_ID, photos_per_page, function (response) {
          //var hasNextPage = response !== undefined && response.length > 0;
          for (var i = 0; i < response.length; i++){
            delete response[i].favorite;
          }
          //var jsonResponse = {photos: response, page: page, has_next_page: hasNextPage};
          var hash = etag(JSON.stringify(response));
          callback(hash);
        });
      }
    });

  }

  function doGetPhotos2(installationId, maxPhotoId, photos_per_page, page, req, res, initial_load){
      db.openConnection(function (err, connection) {
        if (err)
          throw err;
        else{
          db.getPhotos(connection, installationId, maxPhotoId, photos_per_page, function (response) {
            var nextMaxPhotoId;
            if (response.length > 0) {
              nextMaxPhotoId = response[response.length-1].photo_id;
              db.getPhotos(connection, installationId, nextMaxPhotoId, photos_per_page, function (response_next_page) {
                connection.release();
                var hasNextPage = response_next_page !== undefined && response_next_page.length > 0;
                var jsonResponse = {photos: response, page: page, has_next_page: hasNextPage};
                updateGetPhotoCache(req, res, page, installationId, initial_load, nextMaxPhotoId, jsonResponse);
              });
            }else{
              connection.release();
              nextMaxPhotoId = (page == 1) ? MAX_PHOTO_ID : 0;
              var jsonResponse = {photos: response, page: page, has_next_page: false};
                          updateGetPhotoCache(req, res, page, installationId, initial_load, nextMaxPhotoId, jsonResponse);
                      }
                  });
              }
          });
      }

  function doGetPhotos(installationId, page, maxPhotoId, photos_per_page, initial_load, req, res){

    if (page === undefined){
      client.get(STREAM_PREFIX + installationId, function(err, page){
        client.get(STREAM_PREFIX + MAX_PHOTO_ID_PREFIX + installationId, function(err, maxPhotoId){
          if (page == null){
            res.status(401).json({ response_code: 401, message: 'please use /stream endpoint first'});
            return;
          }
          doGetPhotos2(installationId, maxPhotoId, photos_per_page, page, req, res, initial_load);
        });
      });
    }else{
      doGetPhotos2(installationId, maxPhotoId, photos_per_page, page, req, res, initial_load);
    }

  }

  function updateGetPhotoCache(req, res, page, installationId, initial_load, nextMaxPhotoId, jsonResponse){
      var ifModifiedSince = req.header('if-modified-since');
      var response = JSON.parse(JSON.stringify(jsonResponse.photos));
      for (var i = 0; i < response.length; i++){
        delete response[i].favorite;
      }
      var hash = etag(JSON.stringify(response));
      if (ifModifiedSince === undefined || ifModifiedSince === null || ifModifiedSince != hash) {
        if (page == 1) {
          client.set(STREAM_PREFIX + installationId, 2); // Time in ms
          client.set(STREAM_PREFIX + MAX_PHOTO_ID_PREFIX + installationId, nextMaxPhotoId);
          res.setHeader('ETag', hash);
          res.json(jsonResponse)
        }else{
          client.get(STREAM_PREFIX + installationId, function(err, value){
            var newPage = parseInt(value) + 1;
            client.set(STREAM_PREFIX + installationId, newPage);
            client.set(STREAM_PREFIX + MAX_PHOTO_ID_PREFIX + installationId, nextMaxPhotoId);
            res.setHeader('ETag', hash);
            res.json(jsonResponse)
          });
        }
      }else{
        client.get(STREAM_PREFIX + installationId, function(err, value){
          if (page == 1){
            if (value == undefined || value == null || initial_load) {
              client.set(STREAM_PREFIX + installationId, 2);
              client.set(STREAM_PREFIX + MAX_PHOTO_ID_PREFIX + installationId, nextMaxPhotoId);
            }
          }else{
            var newPage = parseInt(value) + 1;
            client.set(STREAM_PREFIX + installationId, newPage);
            client.set(STREAM_PREFIX + MAX_PHOTO_ID_PREFIX + installationId, nextMaxPhotoId);
          }
          res.setHeader('photo-page', page);
          res.status(304).end();
        });
      }
  }

  function doSearch2(installationId, query, maxPhotoId, photos_per_page, res, page){
    db.openConnection(function(err, connection){
      if (err)
        throw err;
      else{
        db.search(connection, installationId, query, maxPhotoId, photos_per_page, function(response){
          if (response.length > 0) {
            var nextMaxPhotoId = response[response.length-1].photo_id;
            client.set(SEARCH_PREFIX + MAX_PHOTO_ID_PREFIX + installationId, nextMaxPhotoId);
            db.search(connection, installationId, query, nextMaxPhotoId, photos_per_page, function (response_next_page) {
              connection.release();
              var hasNextPage = response_next_page !== undefined && response_next_page.length > 0;
              updateSearchCache(installationId, function(){
                res.json({photos: response, page: page, has_next_page: hasNextPage});
              });
            });
          }else{
            connection.release();
            if (page == 1) {
              client.set(SEARCH_PREFIX + MAX_PHOTO_ID_PREFIX + installationId, MAX_PHOTO_ID);
            }
            updateSearchCache(installationId, function(){
                res.json({photos: response, page: page, has_next_page: false});
            });
          }
        });
      }
    });
  }

  function doSearch(installationId, query, page, maxPhotoId, photos_per_page, res){

    if (query === undefined){
      client.get(SEARCH_PREFIX + installationId, function(err, obj){
        obj = JSON.parse(obj);
        if (obj == null){
          res.status(401).json({ response_code: 401, message: 'please use /search endpoint first'});
          return;
        }
        query = obj.query;
        page = obj.page;
        console.log("query: " + query);
        console.log("page: "  + page);
        client.get(SEARCH_PREFIX + MAX_PHOTO_ID_PREFIX + installationId, function(err, maxPhotoId){
          doSearch2(installationId, query, maxPhotoId, photos_per_page, res, page);
        });
      });
    }else{
      var obj = {};
      obj.query = query;
      obj.page = page;
      client.set(SEARCH_PREFIX + installationId, JSON.stringify(obj));
      doSearch2(installationId, query, maxPhotoId, photos_per_page, res, page);
    }

  }

  function updateSearchCache(installationId, callback){
    client.get(SEARCH_PREFIX + installationId, function(err, obj){
      obj = JSON.parse(obj);
      obj.page = parseInt(obj.page) + 1;
      client.set(SEARCH_PREFIX + installationId, JSON.stringify(obj));
      callback();
    });
  }

};