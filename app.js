
/**
* Module dependencies.
*/
var express = require('express'),
    form = require('connect-form'),
    jade = require('jade'),
    mongoose = require('mongoose'),
    util =  require('util'),
    mailer = require('mailer'),
    markdown = require('markdown').markdown,
    models = require('./models'),
    sys = require('sys'),
    path = require('path'),
    geo = require('geo'),
    fs = require('fs'),
    db,
    Friends,
    User,
    Post,
    LoginToken,
    Settings = { development: {}, test: {}, production: {} },
    emails;
     
     
var app = module.exports = express.createServer(form({ keepExtensions: true }));

function renderJadeFile(template, options) {
  var fn = jade.compile(template, options);
  return fn(options.locals);
}

// Configuration
var pub = __dirname + '/public';

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.bodyParser());
  //app.use(connectTimeout({ time: 10000 }));
  app.use(express.logger());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({ secret: 'htuayreve'}));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
  app.use(require('stylus').middleware({ src: __dirname + '/public' }));
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
  app.set('mailOptions', {
    host: 'localhost',
    port: '25',
    from: 'darhamid@gmail.com'
  });
});
   
app.helpers(require('./helpers.js').helpers);
app.dynamicHelpers(require('./helpers.js').dynamicHelpers);


app.configure('development', function() {
  app.set('db-uri', 'mongodb://localhost/nodejs_social_network_new');
  app.use(express.errorHandler({ dumpExceptions: true }));
});


app.configure('production', function() {
  app.set('db-uri', 'mongodb://localhost/nodejs_social_network');
});


models.defineModels(mongoose, function() {
  app.User = User = mongoose.model('User');
  app.Friends = Friends = mongoose.model('Friends');
  app.Post = Post = mongoose.model('Post');
  app.LoginToken = LoginToken = mongoose.model('LoginToken');
  db = mongoose.connect(app.set('db-uri'));
})

 


// Error handling
function NotFound(msg) {
  this.name = 'NotFound';
  Error.call(this, msg);
  Error.captureStackTrace(this, arguments.callee);
}

sys.inherits(NotFound, Error);

app.get('/404', function(req, res) {
  throw new NotFound;
});

app.get('/500', function(req, res) {
  throw new Error('An expected error');
});

app.get('/bad', function(req, res) {
  unknownMethod();
});

app.error(function(err, req, res, next) {
  if (err instanceof NotFound) {
    res.render('404.jade', { status: 404 });
  } else {
    next(err);
  }
});

if (app.settings.env == 'production') {
  app.error(function(err, req, res) {
    res.render('500.jade', {
      status: 500,
      locals: {
        error: err
      } 
    });
  });
}

//New Code 


emails = {
  send: function(template, mailOptions, templateOptions) {
    mailOptions.to = mailOptions.to;
    renderJadeFile(path.join(__dirname, 'views', 'mailer', template), templateOptions, function(err, text) {
      // Add the rendered Jade template to the mailOptions
      mailOptions.body = text;

      // Merge the app's mail options
      var keys = Object.keys(app.set('mailOptions')),
          k;
      for (var i = 0, len = keys.length; i < len; i++) {
        k = keys[i];
        if (!mailOptions.hasOwnProperty(k))
          mailOptions[k] = app.set('mailOptions')[k]
      }

      console.log('[SENDING MAIL]', sys.inspect(mailOptions));

      // Only send mails in production
      if (app.settings.env == 'development') {
        mailer.send(mailOptions,
          function(err, result) {
            if (err) {
              console.log(err);
            }
          }
        );
      }
    });
  },

  sendWelcome: function(user) {
    this.send('welcome.jade', { to: user.email, subject: 'Welcome to Video Upload' }, { locals: { user: user } });
  }
};

function authenticateFromLoginToken(req, res, next) {
  var cookie = JSON.parse(req.cookies.logintoken);

  LoginToken.findOne({ email: cookie.email,
                       series: cookie.series,
                       token: cookie.token }, (function(err, token) {
    if (!token) {
      res.redirect('/sessions/new');
      return;
    }

    User.findOne({ email: token.email }, function(err, user) {
      if (user) {
        req.session.user_id = user.id;
        req.currentUser = user;

        token.token = token.randomToken();
        token.save(function() {
          res.cookie('logintoken', token.cookieValue, { expires: new Date(Date.now() + 2 * 604800000), path: '/' });
          next();
        });
      } else {
        res.redirect('/sessions/new');
      }
    });
  }));
}

function loadUser(req, res, next) {
  
  if (req.session.user_id) {
    User.findById(req.session.user_id, function(err, user) {
      if (user) {
        req.currentUser = user;
        next();
      } else {
        res.redirect('/sessions/new');
      }
    });
  } else if (req.cookies.logintoken) {
    authenticateFromLoginToken(req, res, next);
  } else {
    res.redirect('/sessions/new');
  }
}


app.get('/', loadUser, function(req, res) {
  res.redirect('/index')
});

//Share Friends video with urself

app.post('/share/video', loadUser, function(req, res,next){
   var post = Post.findOne({_id:req.body._id},function(err, pst) { 
      var post = new Post();
      post.user_id = req.currentUser.id;
      post.filename = pst.filename;
      post.save(function(err) {
        if (err)
      	  next(err);
       	req.flash('info', 'Video successfully Shared');
        res.redirect('/videos');
      });
  });
});


//show the videos posted by friends
app.get('/user/videos/:id',loadUser, function(req, res){
 User.findById(req.param('id'), function(error, user) {
    console.log('user info',user);
    var post = Post.find({user_id:user._id},function(err,posts) {
      console.log('==============================================================user selected here is the one that is friend'+user.username);
      if(posts.length == 0) {
        req.flash('error', user.username +'&nbsp;'+'Has Not Posted any Video');
        res.redirect('/userinfo');
      }
      else{
	      res.render('videos/index1', {
		locals: {
		  posts: posts,currentUser: req.currentUser,user:user
		}
	      });
           }
   });
 });
});



//show full details of friend
app.get('/friendinfo/show/:id',loadUser, function(req, res){
 User.findById(req.param('id'), function(error, user) {
    console.log('user info',user);
    res.render('userinfo/friend_info', {
      locals: {
        title: 'Full Profile Information',
        user:user,currentUser: req.currentUser
      }
    });
  });
});

//show all friends
app.get('/show/friends', loadUser, function(req, res){
     var myarray= new Array();
     var friend = Friends.find({$or : [{acceptor:req.currentUser.id, status : 1 },
                                       {requestor:req.currentUser.id, status : 1 }
                                     ]
                                },function(err, friends) {
         if(friends == '') {
           req.flash('error', "You don't have any Friend!...Please Add One");
           res.redirect('/userinfo');
         }
         else {
         for(var i=0;i<friends.length;i++) {
            if(friends[i].requestor == req.currentUser.id) {
              myarray[i] = (friends[i].acceptor);
            }
            else {
              myarray[i] = (friends[i].requestor);
            }
            console.log('================my array==='+myarray[i]);
         }
        var user = User.find({_id: {$in :myarray}},function(err,users) {
           console.log('================users==='+users);
           res.render('userinfo/show_friends', {
	     locals: {
               title: 'Friends',
	       users:users,
               currentUser: req.currentUser
             }
           });
        }); 
      }  
    });
});


// accept friend request
app.post('/accept/request', loadUser, function(req, res){
   var user = User.find({_id:req.body._id},function(err, users) { 
     function friendRequestFailed() {
       req.flash('error', 'Unable To Add Friend!...Please Try Again');
     }
     var friend = Friends.find({acceptor:req.currentUser.id, requestor:users[0]._id},function(err, friends) {
       friends[0].status = 1;
       friends[0].save(function(err) {
         if (err) return friendRequestFailed();
         req.flash('info', users[0].username +'Accepted As A Friend:');
         res.redirect('/userinfo');
       });
     });
   });
});

//show all friend requests
app.get('/show/friendrequests', loadUser, function(req, res){
  var myarray= new Array()
  var friend = Friends.find({acceptor:req.currentUser.id,status:'0'},function(err, friends) {
     if(friends.length==0) {
      req.flash('error', 'No Friend Request Currently');
      res.redirect('/userinfo');
    }
    for(var i=0;i<friends.length;i++) {
       myarray[i] = friends[i].requestor

     }
     var user = User.find({_id: {$in :myarray}},function(err,users) {
	res.render('userinfo/show_requests', {
            locals: {
               users: users,currentUser: req.currentUser,
		title :"My Friend Requests"
            } 
        });
     });
  });     
});

//send friend request
app.post('/add/user', loadUser, function(req, res){
   var user = User.find({_id:req.body._id},function(err, users) { 
     function friendRequestFailed() {
       req.flash('error', 'Friend Request Failed!...Please Try Again');
     }
     var friend = Friends.find({ $or : [
                                       {requestor:req.currentUser.id, acceptor:users[0]._id},
                                       {acceptor:req.currentUser.id, requestor:users[0]._id},
                                     ]
                               },function(err, friends) {
       console.log("========================friends"+friends);
       console.log("========================friends"+friends.length);
       //first time the user sends in the request
       if(friends.length==0)
         {
             var friend = new Friends();
             friend.requestor = req.currentUser._id;
             friend.acceptor=users[0]._id;
             friend.date_requested = new Date();
             friend.status = 0;
             friend.save(function(err) {
               if (err) return friendRequestFailed();
               req.flash('info', 'Friend Request Send to:'+ users[0].username);
               res.redirect('/userinfo');
             });
         }
        else {
          for(var i=0;i<friends.length;i++) {
            if((friends[i].requestor == req.currentUser._id) && (friends[i].acceptor==users[0]._id && friends[i].status==1) || 
                (friends[i].acceptor == req.currentUser._id) && (friends[i].requestor==users[0]._id && friends[i].status==1)) {
              req.flash('error', 'Already Friend');
              res.redirect('/userinfo');
            }
            else if((friends[i].requestor == req.currentUser._id) && (friends[i].acceptor==users[0]._id)|| 
                (friends[i].acceptor == req.currentUser._id) && (friends[i].requestor==users[0]._id)) {
              req.flash('error', 'Friend Already Requested');
              res.redirect('/userinfo');
            }
          }
        }
      });
   });
});


//Upload Photo
app.get('/userinfo/new',loadUser, function(req, res){
  res.render('userinfo/new', {
             locals: {
               currentUser: req.currentUser
             }
  });
});

//save photo
app.post('/userinfo/new', loadUser, function(req, res, next) {
  req.form.complete(function(err, fields, files) {
    if(err) {
      next(err);
    } else {
      ins = fs.createReadStream(files.file.path);
      ous = fs.createWriteStream(__dirname + '/public/uploads/photos/' + files.file.filename);
      util.pump(ins, ous, function(err) {
        if(err) {
          req.flash('info', 'util.pump error');
          next(err);
        } else {  
            console.log('within else');
            var user = User.find({_id:req.currentUser.id},function(err, users) {
                  users[0].photo=files.file.filename;
                  users[0].save(function(err) {
                    console.log('inside users');
                    if (err){
      		      next(err)
                    } else {
                       req.flash('info', 'photo Succesfully Uploaded');
        	       res.redirect('/userinfo');
                    }
                  });
            });
         }
                                      
       });                            
    }
  });
});


 

//Show Uploaded Videos
app.get('/videos', loadUser, function(req, res, next){
  Post.find({ user_id: req.currentUser.id },function(err, posts) {
    if(posts.length == 0) {
      req.flash('error', 'No video Uploaded Yet');
      res.redirect('/userinfo');
    }
    else {
    res.render('videos/index1', {
      locals: {
        posts: posts,currentUser: req.currentUser
      }
    });
   }
  });
});

//New Upload
app.get('/videos/new',loadUser, function(req, res){
  res.render('videos/new', {
             locals: {
               post: new Post(),currentUser: req.currentUser
             }
  });
});

//Save Uploaded Video
app.post('/videos',loadUser, function(req, res, next) {
  req.form.complete(function(err, fields, files) {
    if(err) {
      next(err);
    } else {
      ins = fs.createReadStream(files.file.path);
      ous = fs.createWriteStream(__dirname + '/public/uploads/photos/' + files.file.filename);
      var post = new Post();
      post.filename=files.file.filename;
      post.file=files.file.path;
      post.created_at = new Date();
      post.user_id = req.currentUser.id;
      //req.pause();
      function postCreationFailed() {
        req.flash('error', 'Unable to Download ');
        res.render('videos/new', {
          locals: {
             post: new Post(),currentUser: req.currentUser
          }
        });
      }
      //req.resume();
      util.pump(ins, ous, function(err) {
        if(err) {
          req.flash('info', 'util.pump error');
          next(err);
        } else {  
                 console.log('within else');
                 post.save(function(err) {
                   if (err)
      			return postCreationFailed();
       	           req.flash('info', 'Video Succesfully Downloaded');
        	   res.redirect('/videos');
                });
              }
      });
       
    }
  });
});

//index page user information
app.get('/userinfo',loadUser, function(req, res){
  var user = User.find({_id:req.currentUser.id},function(err, users) {
                  res.render('userinfo/index', {
		    locals: {
	              users:users,currentUser: req.currentUser
                    }
                });
  })
});

//Create new user
app.get('/users/new', function(req, res) {
  res.render('users/new.jade', {
    locals: { user: new User() }
  });
});
//Save New User
app.post('/users.:format?', function(req, res) {
   
  var user = new User(req.body.user);
  user.photo='default.png';
  
  var sensor = false;
  var address = req.body.user.location;
  geo.geocoder(geo.google, address, sensor,function(formattedAddress, latitude, longitude) {
    console.log("Formatted Address: " + formattedAddress);
    console.log("Latitude: " + latitude);
    console.log("Longitude: " + longitude);
    user.latitude = latitude;
    user.longitude = longitude;
  
  
  function userSaveFailed() {
    req.flash('error', 'Account creation failed');
    res.render('users/new.jade', {
      locals: { user: user }
    });
  }
  user.save(function(err) {
    if (err) return userSaveFailed();

    req.flash('info', 'Your account has been created');
    emails.sendWelcome(user);

    switch (req.params.format) {
      case 'json':
        res.send(user.toObject());
      break;

      default:
        req.session.user_id = user.id;
        res.redirect('/userinfo');
    }
  });
  });
});

// Sessions
app.get('/sessions/new', function(req, res) {
  res.render('sessions/new.jade', {
    locals: { user: new User() }
  });
});

app.post('/sessions', function(req, res) {
  User.findOne({ email: req.body.user.email }, function(err, user) {
    if (user && user.authenticate(req.body.user.password)) {
       req.session.user_id = user.id;
       var ipAddress = req.connection.remoteAddress;
       sys.puts('===========================IP Address: ' + ipAddress);
        
       
      // Remember me
      if (req.body.remember_me) {
        var loginToken = new LoginToken({ email: user.email });
        loginToken.save(function() {
          res.cookie('logintoken', loginToken.cookieValue, { expires: new Date(Date.now() + 2 * 604800000), path: '/' });
          res.redirect('/userinfo');
        });
      } else {
        res.redirect('/userinfo');
      }
    } else {
      req.flash('error', 'Incorrect credentials');
      res.redirect('/sessions/new');
    }
  }); 
});

app.get('/sessions', loadUser, function(req, res) {
  if (req.session) {
    LoginToken.remove({ email: req.currentUser.email }, function() {});
    res.clearCookie('logintoken');
    req.session.destroy(function() {});
  }
  res.redirect('/sessions/new');
});


// Search
app.post('/search.:format?', loadUser, function(req, res) {
  var user = User.find({$or : [
                                 {keywords: new RegExp(req.body.s, 'i')},
                                 {last_name:new RegExp(req.body.s, 'i')},
                                 {email:req.body.s}
                               ]
         },function(err, users) {
             console.log('errrrrrrrrrrrrrrrrrrrrrrrrrrrorrrrrrrrrrrrrrr'+users);
             if(users== '') {
               req.flash('error','No Such User!...Please Try again');
               res.redirect('/userinfo');
             }
             else if(users[0]._id == req.currentUser.id){
               req.flash('error','No Such User!...Please Try again');
               res.redirect('/userinfo');
             }
             else{
               res.render('userinfo/show_all', {
	          locals: {
                    title: 'Search Information',
	            users:users,
                    currentUser: req.currentUser
                  }
               });
             }
  });
  
});


//show user details
app.get('/users/show/:id',loadUser, function(req, res){
   User.findById(req.param('id'), function(error, user) {
     var friend = Friends.find({ $or : [
                                       {requestor:req.currentUser.id, acceptor:user._id},
                                       {acceptor:req.currentUser.id, requestor:user._id},
                                     ]
                               },function(err, friend) {
        console.log('user info',user);
        console.log('Friend info',friend);
        console.log('Friend length==========================',friend.length);
        //console.log('Friend Status==========================',friend[0].status);
        res.render('userinfo/show', {
          locals: {
            title: 'Full Profile Information',
            user:user, currentUser:req.currentUser,friend:friend
          }
        });
      });
    });
});
 
 
if (!module.parent) {
  app.listen(8000);
  console.log("Express server listening on port %d, log on to http://127.0.0.1:8000", app.address().port);
}

