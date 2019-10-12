resp = require("../response/response.js");
request = require("request");
sync = require('sync-request');
const CONVERSATION_MANAGER_ENDPOINT = "https://hnptbottdmuserver.herokuapp.com/api/conversation-manager"
const RATING_CONVERSATION_ENDPOINT = "https://hnptbottdmuserver.herokuapp.com/api/save-rating-conversation"
// const CONVERSATION_MANAGER_ENDPOINT = "http://127.0.0.1:5000/api/conversation-manager"
// const RATING_CONVERSATION_ENDPOINT = "http://127.0.0.1:5000/api/save-rating-conversation"


module.exports = function (controller) {

    var promiseBucket = {
        default: []
    }

    var userMessageCount = {}

    var isRating = {};
    var star = {};
    var appropriate = {}; // "khong_phu_hop", "hoi_thieu", "phu_hop", "hoi_du",
    var catched_intents = {}; //arr type
    var edited_intents = {}; // arr type

    function isEmpty(obj) {
        for (var key in obj) {
            if (obj.hasOwnProperty(key))
                return false;
        }
        return true;
    }

    function conductOnboarding(bot, message) {

        bot.startConversation(message, function (err, convo) {
            var id = message.user
            console.log(id)
            if (id) {
                var delete_body = sync("DELETE", CONVERSATION_MANAGER_ENDPOINT + "?graph_id=" + id);
                console.log("DELETE GRAPH CODE:" + delete_body.statusCode);
            }
            convo.say({
                text: resp.hello,
            });
            userMessageCount[id] = 0;
        });
    }

    function restartConversation(bot, message) {
        var id = message.user

        if (isRating[id] && message.save) {
            console.log("CALL SAVE API HERE")
            body = {
                star: star[id],
                appropriate: appropriate[id],
                catched_intents: catched_intents[id],
                edited_intents: edited_intents[id],
            }
            console.log(JSON.stringify(body))
            request.post(RATING_CONVERSATION_ENDPOINT, {
                json: body
            }, (err, resp, data) => {
                if (err) {
                    console.log(err);
                } else {
                    console.log(data);
                }
            })
        }
        isRating[id] = false;

        bot.reply(message, {
            graph: {},
            text: resp.thank
        });
        console.log(id)
        if (id) {
            var delete_body = sync("DELETE", CONVERSATION_MANAGER_ENDPOINT + "?graph_id=" + id);
            console.log("DELETE GRAPH CODE:" + delete_body.statusCode);
        }
        setTimeout(() => {
            bot.reply(message, resp.hello)
            userMessageCount[id] = 0;
        }, 1000)

    }

    function callConversationManager(bot, message) {
        console.log(message)
        var id = message.user;
        var raw_mesg = message.text

        if (message.rating_prop) {
            console.log(message.rating_prop)
            if (message.rating_prop.star) star[message.user] = message.rating_prop.star;
            if (message.rating_prop.appropriate) appropriate[message.user] = message.rating_prop.appropriate;
            if (message.rating_prop.catched_intents) edited_intents[message.user] = message.rating_prop.catched_intents;
            return;
        }

        if (message.quit) {
            restartConversation(bot, message);
            return;
        }

        if (message.end_convo) {
            isRating[message.user] = true;
            star[message.user] = -1;
            appropriate[message.user] = "phu_hop"; // "khong_phu_hop", "hoi_thieu", "phu_hop", "hoi_du"
            edited_intents[message.user] = catched_intents[id];
            bot.reply(message, {
                text: resp.start_rating,
                start_rating: true,
                catched_intents: catched_intents[id],
                force_result: [{
                        title: 'Save',
                        payload: {
                            'quit': true,
                            'save': true
                        }
                    },
                    {
                        title: 'Cancel',
                        payload: {
                            'quit': true,
                            'save': false
                        },
                    },
                ]

            });
            return;
        }


        if (!promiseBucket[id]) {
            promiseBucket[id] = []
        }
        var bucket = promiseBucket[id]
        var pLoading = {
            value: true
        };
        bucket.push(pLoading)

        function requestGET() {
            pLoading.value = false;
            if (bucket.every(ele => {
                    return ele.value === false
                })) {
                request.get(CONVERSATION_MANAGER_ENDPOINT + "?graph_id=" + id, {}, (error, res, body) => {
                    // console.log(body)
                    if (error) {
                        bot.reply(message, {
                            graph: graph,
                            text: resp.err
                        })
                        return
                    }
                    try {
                        response_body = JSON.parse(body);
                        graph = response_body.graph;
                        if (graph) catched_intents[id] = graph;
                        console.log("***")
                        console.log(JSON.stringify(response_body));
                        console.log("***")
                        if (promiseBucket[id].every(ele => {
                                return ele.value === false
                            })) {
                            bucket = []
                            promiseBucket[id] = []
                            if (response_body.question) {
                                bot.reply(message, {
                                    text: response_body.question,
                                })
                            }

                            if (response_body.answer) {
                                for (i = 0; i < response_body.answer.length; i++) {
                                    if (response_body.answer.length - 1 == i) {
                                        bot.reply(message, {
                                            text: response_body.answer[i].value,
                                            force_result: [{
                                                title: "Kết thúc cuộc hội thoại",
                                                payload: {
                                                    "end_convo": true
                                                }
                                            }]
                                        })
                                    } else {
                                        bot.reply(message, {
                                            text: response_body.answer[i].value
                                        })
                                    }
                                }

                            }
                        }
                    } catch (e) {
                        bot.reply(message, {
                            text: resp.err
                        })
                    }
                })
            } else {
                console.log(bucket)
                console.log(JSON.stringify(promiseBucket))
            }
        }

        if (raw_mesg && raw_mesg.length > 0) {
            request.post(CONVERSATION_MANAGER_ENDPOINT, {
                json: {
                    graph_id: message.user,
                    message: raw_mesg
                }
            }, (error, res, body) => {
                if (error) {
                    console.log(error);
                    bot.reply(message, {
                        text: resp.err
                    })
                    return
                }
                console.log("FILL: " + JSON.stringify(body));
                requestGET()
            })
        } else {
            requestGET()
        }
    }

    controller.on('hello', conductOnboarding);
    controller.on('welcome_back', conductOnboarding);
    controller.on('message_received', callConversationManager);

}