var converter = new showdown.Converter();
converter.setOption('openLinksInNewWindow', true);
const RESULT_MESSAGE_WIDTH_TRANS = 310;
const price_formatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'VND'
});

const MAX_ATTR = 5;

var Botkit = {
  config: {
    ws_url: (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host,
    reconnect_timeout: 3000,
    max_reconnect: 5
  },
  options: {
    sound: false,
    use_sockets: true
  },
  reconnect_count: 0,
  slider_message_count: 0,
  list_attr_count: 0,
  list_intent_count: 0,
  rating_count: 0,
  guid: null,
  current_user: null,
  on: function (event, handler) {
    this.message_window.addEventListener(event, function (evt) {
      handler(evt.detail);
    });
  },
  trigger: function (event, details) {
    var event = new CustomEvent(event, {
      detail: details
    });
    this.message_window.dispatchEvent(event);
  },
  request: function (url, body) {
    var that = this;
    return new Promise(function (resolve, reject) {
      var xmlhttp = new XMLHttpRequest();

      xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == XMLHttpRequest.DONE) {
          if (xmlhttp.status == 200) {
            var response = xmlhttp.responseText;
            var message = null;
            try {
              message = JSON.parse(response);
            } catch (err) {
              reject(err);
              return;
            }
            resolve(message);
          } else {
            reject(new Error('status_' + xmlhttp.status));
          }
        }
      };

      xmlhttp.open("POST", url, true);
      xmlhttp.setRequestHeader("Content-Type", "application/json");
      xmlhttp.send(JSON.stringify(body));
    });

  },
  send: function (text, e) {
    var that = this;
    if (e) e.preventDefault();
    if (!text) {
      return;
    }
    var message = {
      type: 'outgoing',
      text: text
    };

    this.clearReplies();
    that.renderMessage(message);

    that.deliverMessage({
      type: 'message',
      text: text,
      user: this.guid,
      channel: this.options.use_sockets ? 'socket' : 'webhook'
    });

    this.input.value = '';

    this.trigger('sent', message);

    return false;
  },
  sendCustom: function (text, payload, e) {
    // console.log("here")
    var that = this;
    if (e) e.preventDefault();
    if (!text) {
      return;
    }
    var message = {
      type: 'outgoing',
      text: text
    };

    this.clearReplies();
    that.renderMessage(message);

    that.deliverMessage({
      ...payload,
      type: 'message',
      text: text,
      user: this.guid,
      channel: this.options.use_sockets ? 'socket' : 'webhook'
    });

    this.input.value = '';

    this.trigger('sent', message);

    return false;
  },
  deliverMessage: function (message) {
    if (this.options.use_sockets) {
      this.socket.send(JSON.stringify(message));
    } else {
      this.webhook(message);
    }
  },
  getHistory: function (guid) {
    var that = this;
    if (that.guid) {
      that.request('/botkit/history', {
        user: that.guid
      }).then(function (history) {
        if (history.success) {
          that.trigger('history_loaded', history.history);
        } else {
          that.trigger('history_error', new Error(history.error));
        }
      }).catch(function (err) {
        that.trigger('history_error', err);
      });
    }
  },
  webhook: function (message) {
    var that = this;

    that.request('/botkit/receive', message).then(function (message) {
      that.trigger(message.type, message);
    }).catch(function (err) {
      that.trigger('webhook_error', err);
    });

  },
  connect: function (user) {

    var that = this;

    if (user && user.id) {
      Botkit.setCookie('botkit_guid', user.id, 1);

      user.timezone_offset = new Date().getTimezoneOffset();
      that.current_user = user;
      // console.log('CONNECT WITH USER', user);
    }

    // connect to the chat server!
    if (that.options.use_sockets) {
      that.connectWebsocket(that.config.ws_url);
    } else {
      that.connectWebhook();
    }

  },
  connectWebhook: function () {
    var that = this;
    if (Botkit.getCookie('botkit_guid')) {
      that.guid = Botkit.getCookie('botkit_guid');
      connectEvent = 'welcome_back';
    } else {
      that.guid = that.generate_guid();
      Botkit.setCookie('botkit_guid', that.guid, 1);
    }

    that.getHistory();

    // connect immediately
    that.trigger('connected', {});
    that.webhook({
      type: connectEvent,
      user: that.guid,
      channel: 'webhook',
    });

  },
  connectWebsocket: function (ws_url) {
    var that = this;
    // Create WebSocket connection.
    that.socket = new WebSocket(ws_url);

    var connectEvent = 'hello';
    if (Botkit.getCookie('botkit_guid')) {
      that.guid = Botkit.getCookie('botkit_guid');
      connectEvent = 'welcome_back';
    } else {
      that.guid = that.generate_guid();
      Botkit.setCookie('botkit_guid', that.guid, 1);
    }

    that.getHistory();

    // Connection opened
    that.socket.addEventListener('open', function (event) {
      // console.log('CONNECTED TO SOCKET');
      that.reconnect_count = 0;
      that.trigger('connected', event);
      that.deliverMessage({
        type: connectEvent,
        user: that.guid,
        channel: 'socket',
        user_profile: that.current_user ? that.current_user : null,
      });
    });

    that.socket.addEventListener('error', function (event) {
      // console.error('ERROR', event);
    });

    that.socket.addEventListener('close', function (event) {
      // console.log('SOCKET CLOSED!');
      that.trigger('disconnected', event);
      if (that.reconnect_count < that.config.max_reconnect) {
        setTimeout(function () {
          // console.log('RECONNECTING ATTEMPT ', ++that.reconnect_count);
          that.connectWebsocket(that.config.ws_url);
        }, that.config.reconnect_timeout);
      } else {
        that.message_window.className = 'offline';
      }
    });

    // Listen for messages
    that.socket.addEventListener('message', function (event) {
      var message = null;
      try {
        message = JSON.parse(event.data);
      } catch (err) {
        that.trigger('socket_error', err);
        return;
      }

      that.trigger(message.type, message);
    });
  },
  clearReplies: function () {
    this.replies.innerHTML = '';
  },
  quickReply: function (payload) {
    this.send(payload);
  },
  focus: function () {
    this.input.focus();
  },
  renderMessage: function (message) {
    var that = this;
    console.log(message)
    if (message.start_rating) {
      if (!that.next_line) {
        that.next_line = document.createElement('div');
        that.message_list.appendChild(that.next_line);
      }
      message.ratingId = this.rating_count;
      this.rating_count += 1;
      that.next_line.innerHTML = that.message_rating_template({
        message: message
      });
      if (message.text) {
        var filler = document.getElementById("rating-mask-" + message.ratingId);
        var t = $(`<div class="message">${message.text}</div>`)[0];
        var s = $(`<div class="message">
        <span class="span_bold">Độ phù hợp của kết quả:</span>
        <select class="select" id="appropriate_selector_${message.ratingId}">
          <option value="khong_phu_hop">Không phù hợp</option>
          <option value="hoi_thieu">Hơi thiếu kết quả</option>
          <option value="phu_hop" selected>Phù hợp</option>
          <option value="hoi_du">Hơi dư kết quả</option>
        </select> </br>
        <span class="span_bold">Bạn đã yêu cầu:</span> </br>
          <input type="checkbox" value="Truong" id="Truong_${message.ratingId}">Tư vấn chọn trường</input> </br>
          <input type="checkbox" value="KhoiThi" id="KhoiThi_${message.ratingId}">Tư vấn về khối thi</input> </br>
          <input type="checkbox" value="DiemChuan" id="DiemChuan_${message.ratingId}">Tư vấn về điểm chuẩn</input> </br>
          <input type="checkbox" value="NganhHoc" id="NganhHoc_${message.ratingId}">Tư vấn về ngành học</input> </br>
          <input type="checkbox" value="LoaiHinh" id="LoaiHinh_${message.ratingId}">Hỏi về loại hình của trường</input> </br>
          <input type="checkbox" value="DiaChi" id="DiaChi_${message.ratingId}">Hỏi về địa chỉ của trường</input> </br>
          <input type="checkbox" value="KyTucXa" id="KyTucXa_${message.ratingId}">Hỏi về ký túc xá</input> </br>
          <input type="checkbox" value="MaTruong" id="MaTruong_${message.ratingId}">Hỏi về mã trường</input> </br>
          <input type="checkbox" value="HocPhi" id="HocPhi_${message.ratingId}">Hỏi về học phí trường</input> </br>
          <input type="checkbox" value="other" id="other_${message.ratingId}">Không nằm trong các lựa chọn trên</input> </br>
        <span class="span_bold">Độ hài lòng:</span>
        <div class="rating">
          <a href="javascript:;" class="rating__button" href="#"><svg class="rating__star">
              <use xlink:href="#star"></use>
            </svg></a>
          <a href="javascript:;" class="rating__button" href="#"><svg class="rating__star">
              <use xlink:href="#star"></use>
            </svg></a>
          <a href="javascript:;" class="rating__button" href="#"><svg class="rating__star">
              <use xlink:href="#star"></use>
            </svg></a>
          <a href="javascript:;" class="rating__button" href="#"><svg class="rating__star">
              <use xlink:href="#star"></use>
            </svg></a>
          <a href="javascript:;" class="rating__button" href="#"><svg class="rating__star">
              <use xlink:href="#star"></use>
            </svg></a>
        </div> </br>
        </div>`)[0];
        filler.appendChild(t);
        filler.appendChild(s);
        for (var i = 0; i < message.catched_intents.length; i++) {
          (function (ele) {
            $(`#${ele}_${message.ratingId}`).attr('checked', true);
          })(message.catched_intents[i]);
        }
        $(`#rating-mask-${message.ratingId} input`).change(() => {
          var arr = $(`#rating-mask-${message.ratingId} input`);
          var edited_intents = [];
          for (var i = 0; i < arr.length; i++) {
            (function (ele) {
              if (ele.is(':checked')) edited_intents.push(ele.val());
            })($(arr[i]));
          }
          var anotherThat = that;
          anotherThat.deliverMessage({
            type: 'message',
            rating_prop: {
              catched_intents: edited_intents
            },
            user: that.guid,
            channel: that.options.use_sockets ? 'socket' : 'webhook'
          });
        })
        $(`#appropriate_selector_${message.ratingId}`).change(() => {
          const appropriate_selector = $(`#appropriate_selector_${message.ratingId}`).val();
          var anotherThat = that;
          anotherThat.deliverMessage({
            type: 'message',
            rating_prop: {
              appropriate: appropriate_selector
            },
            user: that.guid,
            channel: that.options.use_sockets ? 'socket' : 'webhook'
          });
        })
        $('.rating__button').on('click', function (e) {
          var $t = $(this), // the clicked star
            $ct = $t.parent(); // the stars container

          // add .is--active to the user selected star 
          $t.siblings().removeClass('is--active').end().toggleClass('is--active');
          // add .has--rating to the rating container, if there's a star selected. remove it if there's no star selected.
          $ct.find('.rating__button.is--active').length ? $ct.addClass('has--rating') : $ct.removeClass('has--rating');

          // sent start
          var anotherThat = that;
          anotherThat.deliverMessage({
            type: 'message',
            rating_prop: {
              star: ($t.index() % 5) + 1
            },
            user: that.guid,
            channel: that.options.use_sockets ? 'socket' : 'webhook'
          });
        });
      }
      if (!message.isTyping) {
        delete(that.next_line);
      }
    } else {
      if (!that.next_line) {
        that.next_line = document.createElement('div');
        that.message_list.appendChild(that.next_line);
      }
      if (message.text) {
        message.html = converter.makeHtml(message.text);
      }

      that.next_line.innerHTML = that.message_template({
        message: message
      });
      if (!message.isTyping) {
        delete(that.next_line);
      }
    }
  },
  triggerScript: function (script, thread) {
    this.deliverMessage({
      type: 'trigger',
      user: this.guid,
      channel: 'socket',
      script: script,
      thread: thread
    });
  },
  identifyUser: function (user) {

    user.timezone_offset = new Date().getTimezoneOffset();

    this.guid = user.id;
    Botkit.setCookie('botkit_guid', user.id, 1);

    this.current_user = user;

    this.deliverMessage({
      type: 'identify',
      user: this.guid,
      channel: 'socket',
      user_profile: user,
    });
  },
  receiveCommand: function (event) {
    switch (event.data.name) {
      case 'trigger':
        Botkit.triggerScript(event.data.script, event.data.thread);
        break;
      case 'identify':
        Botkit.identifyUser(event.data.user);
        break;
      case 'connect':
        Botkit.connect(event.data.user);
        break;
      default:
    }
  },
  sendEvent: function (event) {

    if (this.parent_window) {
      this.parent_window.postMessage(event, '*');
    }

  },
  setCookie: function (cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
  },
  getCookie: function (cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
      }
    }
    return "";
  },
  generate_guid: function () {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
  },
  boot: function (user) {

    var that = this;

    that.message_window = document.getElementById("message_window");

    that.message_list = document.getElementById("message_list");

    var source = document.getElementById('message_template').innerHTML;
    that.message_template = Handlebars.compile(source);

    var custom_source = document.getElementById('message_slider_template').innerHTML;
    that.message_slider_template = Handlebars.compile(custom_source);

    var custom_source_2 = document.getElementById('message_list_template').innerHTML;
    that.message_list_template = Handlebars.compile(custom_source_2);

    var custom_source_3 = document.getElementById('message_intent_template').innerHTML;
    that.message_intent_template = Handlebars.compile(custom_source_3);

    var custom_source_4 = document.getElementById('message_rating_template').innerHTML;
    that.message_rating_template = Handlebars.compile(custom_source_4);

    that.replies = document.getElementById('message_replies');

    that.input = document.getElementById('messenger_input');

    that.focus();

    that.on('connected', function () {
      that.message_window.className = 'connected';
      that.input.disabled = false;
      that.sendEvent({
        name: 'connected'
      });
    })

    that.on('disconnected', function () {
      that.message_window.className = 'disconnected';
      that.input.disabled = true;
    });

    that.on('webhook_error', function (err) {
      alert('Error sending message!');
    });

    that.on('typing', function () {
      that.clearReplies();
      that.renderMessage({
        isTyping: true
      });
    });

    that.on('sent', function () {
      if (that.options.sound) {
        var audio = new Audio('sent.mp3');
        audio.play();
      }
    });

    that.on('message', function () {
      if (that.options.sound) {
        var audio = new Audio('beep.mp3');
        audio.play();
      }
    });

    that.on('message', function (message) {
      that.renderMessage(message);
    });

    that.on('message', function (message) {
      that.clearReplies();
      if (message.quick_replies) {

        var list = document.createElement('ul');

        var elements = [];
        for (var r = 0; r < message.quick_replies.length; r++) {
          (function (reply) {

            var li = document.createElement('li');
            var el = document.createElement('a');
            el.innerHTML = reply.title;
            el.href = '#';

            el.onclick = function () {
              // that.quickReply(reply.payload);
              that.sendCustom(reply.title, reply.payload, null);
            }

            li.appendChild(el);
            list.appendChild(li);
            elements.push(li);

          })(message.quick_replies[r]);
        }

        that.replies.appendChild(list);

        if (message.disable_input) {
          that.input.disabled = true;
        } else {
          that.input.disabled = false;
        }
      } else {
        that.input.disabled = false;
      }
    });


    that.on('message', function (message) {
      that.clearReplies();
      if (message.force_result) {

        var list = document.createElement('ul');

        var elements = [];
        for (var r = 0; r < message.force_result.length; r++) {
          (function (reply) {

            var li = document.createElement('li');
            var el = document.createElement('a');
            el.innerHTML = reply.title;
            el.href = '#';

            el.onclick = function () {
              that.sendCustom(reply.title, reply.payload);
            }

            li.appendChild(el);
            list.appendChild(li);
            elements.push(li);

          })(message.force_result[r]);
        }

        that.replies.appendChild(list);

        if (message.disable_input) {
          that.input.disabled = true;
        } else {
          that.input.disabled = false;
        }
      } else {
        that.input.disabled = false;
      }
    });


    that.on('history_loaded', function (history) {
      if (history) {
        for (var m = 0; m < history.length; m++) {
          that.renderMessage({
            text: history[m].text,
            type: history[m].type == 'message_received' ? 'outgoing' : 'incoming', // set appropriate CSS class
          });
        }
      }
    });


    if (window.self !== window.top) {
      that.parent_window = window.parent;
      window.addEventListener("message", that.receiveCommand, false);
      that.sendEvent({
        type: 'event',
        name: 'booted'
      });

    } else {
      that.connect(user);
    }

    return that;
  }
};


(function () {
  Botkit.boot();
})();