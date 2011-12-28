
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
    WallPost,
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
  app.set('db-uri', 'mongodb://localhost/nodejs_social_network_new-26');
  app.use(express.errorHandler({ dumpExceptions: true }));
});


app.configure('production', function() {
  app.set('db-uri', 'mongodb://localhost/nodejs_social_network');
});


models.defineModels(mongoose, function() {
  app.User = User = mongoose.model('User');
  app.WallPost = WallPost = mongoose.model('WallPost');
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

//View User Profile information
/*app.get('/userinfo',loadUser, function(req, res){
  var user = User.find({_id:req.currentUser.id},function(err, users) {
                  res.render('userinfo/index', {
		    locals: {
	              users:users,currentUser: req.currentUser
                    }
                });
  })
});*/

//Edit User

// update user information
app.put('/user/edit/:id', loadUser, function(req, res, next) {
  User.findById(req.params.id, function(err, user) {
     function userUpdateFailed() {
        req.flash('error', 'Failed To Update The User!.. Please Try Again');
        res.render('users/edit', {
          locals: {
            user: user,currentUser:req.currentUser
          }
        });
      }
    console.log('user id======================'+user.id);
    console.log('current user id======================'+req.currentUser.id);
    console.log('request======================'+req.body.user.first_name);
    if (!user)
      return next(new NotFound('User Not Found'));
    else {
           user.first_name = req.body.user.first_name 
           user.last_name =  req.body.user.last_name
           user.age =  req.body.user.age
           user.sex =  req.body.user.sex
           user.location =  req.body.user.location
           var sensor = false;
           var address = req.body.user.location;
           geo.geocoder(geo.google, address, sensor,function(formattedAddress, latitude, longitude) {
    	     console.log("Formatted Address: " + formattedAddress);
    	     console.log("Latitude: " + latitude);
    	     console.log("Longitude: " + longitude);
    	     user.latitude = latitude;
    	     user.longitude = longitude;
             user.save(function(err) {
               if(err)
                 return userUpdateFailed();
               req.flash('info', 'Succesfully Upadated Changes');
               res.redirect('/userinfo');
             });
          });
       }
  });
});


app.get('/user/edit/:id', loadUser, function(req, res, next) {
  User.findById(req.params.id, function(err, user) {
    if (!user)
      return next(new NotFound('User could not be found'));
    else {
      res.render('users/edit', {
        locals: {
          user: user,currentUser: req.currentUser

        }
      });
    }
  });
});




//Add Comment To The Wall Post

app.post('/comment', loadUser, function(req, res, next) {
  console.log('=======================request========'+req);
  console.log("=======================request params========"+req.body._id);
  console.log("=======================request params body========"+req.body.commentbody);
  
  var post = WallPost.findById(req.body._id,function(err, post) {
    console.log('============================post=======' +post);
    console.log('============================post id=======' +post._id);
    console.log('============================post created at=======' +post.created);
    console.log('============================comments=======' +post.comments);
    if (!post)
      return next(new NotFound('Post Not found'));
    else {
      // append comment
      var comment = {
          body: req.body.commentbody,
          date: new Date()
      };
      post.comments.$push(comment);
      
      console.log("+++++++++++++++++++++++++++++++++++++"+post.comments);
      function commentCreationFailed() {
        req.flash('error', 'Unable To Save Comment..Please Try Again');
        res.render('wallpost/index', {
          locals: { post: post , currentUser:req.currentUser}
        });
      }
      
      post.save(function(err) {
        if (err)
          return commentCreationFailed();

        req.flash('info', 'Thank you! Your comment has been saved.');
        res.redirect('/wallpost');
        //res.redirect('/' + req.params.year + '/' + req.params.month + '/' + req.params.day + '/' + req.params.slug + '/');
      }); 
    }
  });
});





// save new Wall post

app.get('/wallpost', loadUser, function(req, res) {
  var post = WallPost.find({user_id:req.currentUser.id}).sort('created', -1).execFind(function(err, posts) {
    console.log('=============================posts'+posts);
    res.render('wallpost/index', {
	locals: {
	  posts:posts,currentUser: req.currentUser
        }
    });
  });


}); 


// save new Wall post
app.post('/wall/create', loadUser, function(req, res) {  
  var post = new WallPost();
  post.body = req.body.post.body;
  console.log('===============================================wallpost',post.body);
  post.created = new Date();
  post.modified = new Date();
  post.user_id = req.currentUser.id;
  function postCreationFailed() {
    req.flash('error', 'Failed to Post on Wall');
    res.render('wallpost/create', {
      locals: {
        posts: posts,
        currentUser : req.currentUser
      }
    });
  }

  post.save(function(err,posts) {
    console.log('================================================posts====================',posts);
    console.log('================================================posts====================',posts.body);
    if (err)
      return postCreationFailed();
    req.flash('info', 'Posted Successfully');
    res.redirect('/wallpost');
  });
});

//Adding Wall 


app.get('/wall/create', loadUser, function(req, res) {
  res.render('wallpost/create', {
    locals: {
      post: new WallPost(),
      currentUser : req.currentUser
    }
  });
});



app.get('/userinfo',loadUser, function(req, res){
  var user = User.find({_id:req.currentUser.id},function(err, users) {
           res.render('userinfo/index', {
	     locals: {
	       users:users,currentUser: req.currentUser
             }
           });
  });
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
  var email = req.body.email;
  var first_name = req.body.first_name;
  user.email = email;
  console.log('email id ============================================='+user.email);
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
   
  var ua = req.headers['user-agent'].toLowerCase();
	if(/android.+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(ua)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|e\-|e\/|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(di|rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|xda(\-|2|g)|yas\-|your|zeto|zte\-/i.test(ua.substr(0,4))) {
		res.render('Social/home', {
                locals: { user: new User() }
              });
	}
        else {
              res.render('sessions/new.jade', {
                locals: { user: new User() }
              });
             }

});

app.post('/sessions', function(req, res) {
  console.log('========================================================================inside sessions');
  User.findOne({ email: req.body.user.email }, function(err, user) {
    console.log('====================users ==================='+user);
    if (user && user.authenticate(req.body.user.password)) {
       console.log('====================users ==================='+user);
       console.log('====================users ==================='+user.username);
       req.session.user_id = user.id;
       console.log("---------------------------user session information---------------"+req.session.user_id);
       
      // Remember me
      if (req.body.remember_me) {
        var loginToken = new LoginToken({ email: user.email });
        loginToken.save(function() {
          res.cookie('logintoken', loginToken.cookieValue, { expires: new Date(Date.now() + 2 * 604800000), path: '/' });
          res.redirect('/userinfo');
        });
      } else {
              
              var ua = req.headers['user-agent'].toLowerCase();
	if(/android.+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(ua)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|e\-|e\/|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(di|rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|xda(\-|2|g)|yas\-|your|zeto|zte\-/i.test(ua.substr(0,4))) {
              res.render('Social/index');
	}
        else {
              res.redirect('/userinfo');
             }
      }
    } else {
      console.log('invalid username password');
      //req.flash('error', 'Incorrect credentials');
      res.redirect('/Social/index');
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

