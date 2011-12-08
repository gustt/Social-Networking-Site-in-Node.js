(function() {
  var Video, Videos, VideoRow, VideoList,
      VideoControls, ListToolBar, AppView,
      SearchView;

  _.templateSettings = {
    interpolate: /\{\{(.+?)\}\}/g
  };

  Video = Backbone.Model.extend({
    Collection: Video,

    url: function() {
      return this.urlWithFormat('json');
    },

    urlWithFormat: function(format) {
      return this.get('id') ? '/videos/' + this.get('id') + '.' + format : '/videos.json';
    },

    display: function() {
      this.fetch({
        success: function(model, response) {
          $('#editor-container input.title').val(model.get('title'));
          $('#editor').val(model.get('video'));
        }
      });
    }
  });

  Videos = new Backbone.Collection();
  Videos.url = '/Videos/titles.json';
  Videos.model = Video;
  Videos.comparator = function(v) {
    return v.get('title') && v.get('title').toLowerCase();
  };

  VideoRow = Backbone.View.extend({
    tagName: 'li',

    events: {
      'click a': 'open'
    },

    template: _.template($('#video-row-template').html()),

    initialize: function() {
      _.bindAll(this, 'render');
    },

    open: function() {
      $('#video-list .selected').removeClass('selected');
      $(this.el).addClass('selected');
      this.model.display();
      appView.videoList.selectedVideo = this.model;
    },

    remove: function() {
      $(this.el).remove();
    },

    render: function() {
      $(this.el).html(this.template({
        id: this.model.id,
        title: this.model.get('title')
      }));
      return this;
    }
  });

  VideoList = Backbone.View.extend({
    el: $('#video-list'),
    Collection: Videos,

    events: {
      'click #show-all': 'showAll',
    },

    initialize: function() {
      _.bindAll(this, 'render', 'addVideo', 'showAll', 'create');
      this.Collection.bind('reset', this.render);
    },

    addVideo: function(v) {
      var index = Videos.indexOf(v) + 1;
      v.rowView = new VideoRow({ model: v });
      var el = this.el.find('li:nth-child(' + index + ')');
      if (el.length) {
        el.after(v.rowView.render().el);
      } else {
        this.el.append(v.rowView.render().el);
      }
    },

    resort: function() {
      Videos.sort({ silent: true });
    },

    create: function(title, video) {
      this.selectedVideo.set({
        title: title,
        video: video
      });
      
      this.selectedVideo.save();
      this.selectedVideo.rowView.render();
      this.resort();
    },

    render: function(videos) {
      var videoList = this;
      videos.each(function(v) {
        videoList.addVideo(v);
      });

      // Open the first document by default
      if (!this.selectedVideo) {
        this.openFirst();
      }
    },

    openFirst: function() {
      if (Videos.length) {
        Videos.first().rowView.open();
      }
    },

    showAll: function(e) {
      e.preventDefault();
      this.el.html('');
      Videos.fetch({ success: this.openFirst });
      appView.searchView.reset();
    }
  });

  VideoControls = Backbone.View.extend({
    el: $('#controls'),

    events: {
      'click #save-button': 'save',
      'click #html-button': 'showHTML'
    },

    initialize: function(model) {
      _.bindAll(this, 'save', 'showHTML');
    },

    save: function(e) {
      e.preventDefault();

      var title = $('input.title').val(),
          video = $('#editor').val();

      if (!appView.videoList.selectedVideo) {
        Videos.create({ title: title, video: video }, {
          success: function(model) {
            Videos.fetch();
          }
        });
      } else {
        appView.videoList.create(title, video);
      }
    },

    showHTML: function(e) {
      e.preventDefault();

      var model = appView.videoList.selectedVideo,
        html = model.urlWithFormat('html');

      $.get(html, function(video) {
        $('#html-container').html(video);
        $('#html-container').dialog({
          title: model.get('title'),
          autoOpen: true,
          modal: true,
          width: $(window).width() * 0.95,
          height: $(window).height() * 0.90
        });
      });
    }
  });

  ListToolBar = Backbone.View.extend({
    el: $('#left .toolbar'),

    events: {
      'click #create-video': 'add',
      'click #delete-video': 'remove'
    },

    initialize: function(model) {
      _.bindAll(this, 'add', 'remove');
    },

    add: function(e) {
      e.preventDefault();
      var v = new Video({ title: 'Untitled Video', video: '' });
      v.save();
      Videos.add(v);
      appView.videoList.addVideo(v);
      v.rowView.open();
      $('#editor-container input.title').focus();
    },

    remove: function(e) {
      e.preventDefault();
      var model = appView.videoList.selectedVideo;

      if (!model) return;
      if (confirm('Are you sure you want to delete that video?')) {
        model.rowView.remove();
        model.destroy();
        Videos.remove(model);
        appView.videoList.selectedVideo = null;
        $('#editor-container input.title').val('');
        $('#editor').val('');
        $('#video-list li:visible:first a').click();
      }
    }
  });

  SearchView = Backbone.View.extend({
    el: $('#header .search'),

    events: {
      'focus input[name="s"]': 'focus',
      'blur input[name="s"]': 'blur',
      'submit': 'submit'
    },

    initialize: function(model) {
      _.bindAll(this, 'search', 'reset');
    },

    focus: function(e) {
      var element = $(e.currentTarget);
      if (element.val() === 'Search')
        element.val('');
    },

    blur: function(e) {
      var element = $(e.currentTarget);
      if (element.val().length === 0)
        element.val('Search');
    },

    submit: function(e) {
      e.preventDefault();
      this.search($('input[name="s"]').val());
    },

    reset: function() {
      this.el.find("input[name='s']").val('Search');
    },

    search: function(value) {
      $.post('/search.json', { s: value }, function(results) {
        appView.videoList.el.html('<li><a id="show-all" href="#">Show All</a></li>');

        if (results.length === 0) {
          alert('No results found');
        } else {
          for (var i = 0; i < results.length; i++) {
            var v = new Video(results[i]);
            appView.VideoList.addVideo(v);
          }
        }
      }, 'json');
    }
  });

  AppView = Backbone.View.extend({
    initialize: function() {
      this.videosList = new VideoList();
      this.searchView = new SearchView();
      this.toolbar = new ListToolBar();
      this.videosControls = new VideoControls();
    }
  });

  var appView = new AppView();
  window.Videos = Videos;
  window.appView = appView;

  $('#logout').click(function(e) {
    e.preventDefault();
    if (confirm('Are you sure you want to log out?')) {
      var element = $(this),
          form = $('<form></form>');
      form
        .attr({
          method: 'POST',
          action: '/sessions'
        })
        .hide()
        .append('<input type="hidden" />')
        .find('input')
        .attr({
          'name': '_method',
          'value': 'delete'
        })
        .end()
        .appendTo('body')
        .submit();
    }
  });
})();
