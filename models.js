var crypto = require('crypto'),
    Friends,
    User,
    Post,
    LoginToken;

function extractKeywords(text) {
  if (!text) return [];

  return text.
    split(/\s+/).
    filter(function(v) { return v.length > 2; }).
    filter(function(v, i, a) { return a.lastIndexOf(v) === i; });
}


function defineModels(mongoose, fn) {
  var Schema = mongoose.Schema,
      ObjectId = Schema.ObjectId;


/**
    * Model: User
    */
function validatePresenceOf(value) {
  return value && value.length;
}
var User = new Schema({
    'first_name': String,
    'last_name':String,
    'age':Number,
    'sex':String,
    'photo':String,
    'location':String,
    'latitude' : String,
    'longitude' : String,
    'keywords': [String],
    'username':String,
    'email': { type: String, validate: [validatePresenceOf, 'an email is required'], index: { unique: true } },
    'hashed_password': String,
    'salt': String,
  });

  User.virtual('id')
    .get(function() {
      return this._id.toHexString();
    });

  User.virtual('password')
    .set(function(password) {
      this._password = password;
      this.salt = this.makeSalt();
      this.hashed_password = this.encryptPassword(password);
    })
    .get(function() { return this._password; });

  User.method('authenticate', function(plainText) {
    return this.encryptPassword(plainText) === this.hashed_password;
  });
  
  User.method('makeSalt', function() {
    return Math.round((new Date().valueOf() * Math.random())) + '';
  });

  User.method('encryptPassword', function(password) {
    return crypto.createHmac('sha1', this.salt).update(password).digest('hex');
  });

  User.pre('save', function(next) {
    this.keywords = extractKeywords(this.first_name);
    /*if (!validatePresenceOf(this.password)) {
      next(new Error('Invalid password'));
    } else {
      next();
    }*/
    next();
  });


var Friends = new Schema({
    requestor : String
  , acceptor : String 
  , date_requested : Date
  , status:Number
});

Friends.virtual('id')
    .get(function() {
      return this._id.toHexString();
    });
 
var Post = new Schema({
    filename : { type: String, index: true }
  , file : String
  , created_at : Date
  , user_id: ObjectId
});

Post.virtual('id')
    .get(function() {
      return this._id.toHexString();
    });

/**
    * Model: LoginToken
    *
    * Used for session persistence.
    */
var LoginToken = new Schema({
    email: { type: String, index: true },
    series: { type: String, index: true },
    token: { type: String, index: true }
  });

  LoginToken.method('randomToken', function() {
    return Math.round((new Date().valueOf() * Math.random())) + '';
  });

  LoginToken.pre('save', function(next) {
    // Automatically create the tokens
    this.token = this.randomToken();

    if (this.isNew)
      this.series = this.randomToken();

    next();
  });

  LoginToken.virtual('id')
    .get(function() {
      return this._id.toHexString();
    });

  LoginToken.virtual('cookieValue')
    .get(function() {
      return JSON.stringify({ email: this.email, token: this.token, series: this.series });
    });


 
  mongoose.model('User', User);
  mongoose.model('Post', Post);
  mongoose.model('Friends', Friends);
  mongoose.model('LoginToken', LoginToken);
  fn();
}

exports.defineModels = defineModels;
 

