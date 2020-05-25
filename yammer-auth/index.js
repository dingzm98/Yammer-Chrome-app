var gh = (function() {
  'use strict';

  var signin_button;
  var revoke_button;
  var submit_button;
  var group_select_button;
  var user_info_div;
  var user_id;
  var topic1;
  var contentin;
  var group_list = [];
  var groupid_list = [];
  var selected_group_id = 9734488064;
  var tokenFetcher = (function() {
    // Replace clientId and clientSecret with values obtained by you for your
    var clientId = '913NICZD1CuUItLSW2t4w';
    // Note that in a real-production app, you may not want to store
    // clientSecret in your App code.
    var clientSecret = 'QnD94Q4q0uwVD88u6K0sdINclLK2WrjSxDsf3892cc';
    var redirectUri = chrome.identity.getRedirectURL('yammer');
    console.log(redirectUri);
    var redirectRe = new RegExp(redirectUri + '[#\?](.*)');

    var access_token = null;

    return {
      getToken: function(interactive, callback) {
        // In case we already have an access_token cached, simply return it.
        if (access_token) {
          callback(null, access_token);
          return;
        }

        var options = {
          'interactive': interactive,
          'url': 'https://www.yammer.com/oauth2/authorize' +
                 '?client_id=' + clientId + "&response_type=token" +
                 '&redirect_uri=' + encodeURIComponent(redirectUri)
        }
        chrome.identity.launchWebAuthFlow(options, function(redirectUri) {
          console.log('launchWebAuthFlow completed', chrome.runtime.lastError,
              redirectUri);

          if (chrome.runtime.lastError) {
            callback(new Error(chrome.runtime.lastError));
            return;
          }

          // Upon success the response is appended to redirectUri, e.g.
          // https://{app_id}.chromiumapp.org/provider_cb#access_token={value}
          //     &refresh_token={value}
          // or:
          // https://{app_id}.chromiumapp.org/provider_cb#code={value}
          var matches = redirectUri.match(redirectRe);
          if (matches && matches.length > 1)
            handleProviderResponse(parseRedirectFragment(matches[1]));
          else
            callback(new Error('Invalid redirect URI'));
        });

        function parseRedirectFragment(fragment) {
          var pairs = fragment.split(/&/);
          var values = {};

          pairs.forEach(function(pair) {
            var nameval = pair.split(/=/);
            values[nameval[0]] = nameval[1];
          });

          return values;
        }

        function handleProviderResponse(values) {
          console.log('providerResponse', values);
          if (values.hasOwnProperty('access_token'))
            setAccessToken(values.access_token);
          // If response does not have an access_token, it might have the code,
          // which can be used in exchange for token.
          else if (values.hasOwnProperty('code'))
            exchangeCodeForToken(values.code);
          else 
            callback(new Error('Neither access_token nor code avialable.'));
        }

        function exchangeCodeForToken(code) {
          var xhr = new XMLHttpRequest();
          xhr.open('POST',
                   'https://cors-anywhere.herokuapp.com/https://www.yammer.com/oauth2/access_token?/oauth/access_token?' +
                   'client_id=' + clientId +
                   '&client_secret=' + clientSecret +
                   '&code=' + code +
                   '&grant_type=authorization_code'
          );
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.onload = function () {
            // When exchanging code for token, the response comes as json, which
            // can be easily parsed to an object.
            if (this.status === 200) {
              var response = JSON.parse(this.responseText);
              console.log(response);
              if (response.hasOwnProperty('access_token')) {
                setAccessToken(response.access_token);
              } else {
                callback(new Error('Cannot obtain access_token from code.'));
              }
            } else {
              console.log('code exchange status:', this.status);
              callback(new Error('Code exchange failed'));
            }
          };
          xhr.send();
        }

        function setAccessToken(token) {
          access_token = token; 
          console.log('Setting access_token: ', access_token);
          callback(null, access_token);
        }
      },

      removeCachedToken: function(token_to_remove) {
        if (access_token == token_to_remove)
          access_token = null;
      }
    }
  })();

  function xhrWithAuth(method, url, interactive, callback,data) {
    var retry = true;
    var access_token;
    //console.log('xhrWithAuth', method, url, interactive);
    getToken();

    function getToken() {
      tokenFetcher.getToken(interactive, function(error, token) {
        //console.log('token fetch', error, token);
        if (error) {
          callback(error);
          return;
        }

        access_token = token;
        requestStart(data);
      });
    }

    function requestStart(data) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + access_token);
      xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
      xhr.setRequestHeader('yammer-capabilities', 'external-messaging,external-groups');
      xhr.onload = requestComplete;
      if(data){
      var json = JSON.stringify(data);
      //console.log(json);
      xhr.send(JSON.stringify(data));
      }
      else{
        console.log("no data detect")
      xhr.send();
      }

    }

    function requestComplete() {
      //console.log('requestComplete', this.status, this.response);
      if ( ( this.status < 200 || this.status >=300 ) && retry) {
        retry = false;
        tokenFetcher.removeCachedToken(access_token);
        access_token = null;
        getToken();
      } else {
        callback(null, this.status, this.response);
      }
    }
  }

  function getUserInfo(interactive) {
    xhrWithAuth('GET',
                'https://cors-anywhere.herokuapp.com/https://www.yammer.com/api/v1/users/current.json',
                interactive,
                onUserInfoFetched);
  }

  // Functions updating the User Interface:

  function showButton(button) {
    button.style.display = 'inline';
    button.disabled = false;
  }

  function hideButton(button) {
    button.style.display = 'none';
  }

  function disableButton(button) {
    button.disabled = true;
  }

  function onUserInfoFetched(error, status, response) {
    if (!error && status == 200) {
      //console.log("Got the following user info: " + response);
      //update UI
      var user_info = JSON.parse(response);
      populateUserInfo(user_info);
      hideButton(signin_button);
      showButton(revoke_button);
      showButton(submit_button);
      fetchUsergroup(user_id);
    } else {
      console.log('infoFetch failed', error, status);
      showButton(signin_button);
    }
  }

  //show user's name and id
  function populateUserInfo(user_info) {
    var elem = user_info_div;
    var nameElem = document.createElement('div');
    nameElem.innerHTML = "<b>Hello " + user_info.full_name + "</b><br>"
      + "Your user Id is : " + user_info.id;
      user_id = user_info.id;
    elem.appendChild(nameElem);
  }


  //create group dropdown window
  function fetchUsergroup(user_id) {
    xhrWithAuth('GET', 'https://cors-anywhere.herokuapp.com/https://www.yammer.com/api/v1/groups/for_user/'+user_id+'.json', false, onUserReposFetched);
  }

  //create group dropdown window
  function onUserReposFetched(error, status, response) {
    if (!error && status == 200) {
      //console.log("Got the following user groups:", response);
      var user_repos = JSON.parse(response);
      user_repos.forEach(function(repo) {
        group_list.push(repo.name)
        groupid_list.push(repo.id)
      });
    } else {
      console.log('infoFetch failed', error, status);
    }
    console.log(group_list);
    var string="";
    var i;
    for(i=0;i<group_list.length;i++)
    {
        string=string+"<option value="+group_list[i]+">"+group_list[i]+"</option>";
    }
    document.getElementById("groups").innerHTML=string;
  }

  function useless(){
    
  }

  function autopost(data) {
    xhrWithAuth('POST', 'https://cors-anywhere.herokuapp.com/https://www.yammer.com/api/v1/messages', false, useless,data);
  }

 
  function interactiveSignIn() {
    disableButton(signin_button);
    tokenFetcher.getToken(true, function(error, access_token) {
      if (error) {
        showButton(signin_button);
      } else {
        getUserInfo(true);
      }
    });
  }
  
  function afterlogout(){
    group_list = [];
    groupid_list = [];
    user_info_div.textContent = '';
    hideButton(revoke_button);
    showButton(signin_button);
    document.getElementById("groups").innerHTML= "";
  }

  function revokeToken() {
    xhrWithAuth('POST', 'https://cors-anywhere.herokuapp.com/https://www.yammer.com/api/v1/mobile_sessions/revoke', false, afterlogout);
    
  }
  //Tier 1 model
  function categorymodel(contentin){
    var data = {
      "body": contentin
    }
    xhrWithAuth('POST', 'https://cors-anywhere.herokuapp.com/http://a089ec8b4801511eaaf7502ed822b4dd-589797411.us-west-2.elb.amazonaws.com/mml-test-api', false, categorize,data);
  
  }
  //Tier 2 model
  function categorymodel2(contentin){
    var data = {
      "body": contentin
    }
    xhrWithAuth('POST', 'https://cors-anywhere.herokuapp.com/http://a089ec8b4801511eaaf7502ed822b4dd-589797411.us-west-2.elb.amazonaws.com/second-tier-api', false, categorize2,data);  
  }
  //tier 1 model tag added
  function categorize(error, status, response) {
    if (!error && status == 200) {
      console.log("this msg belong to tier1: ", response); 
      topic1 = JSON.parse(response)[0];
      categorymodel2(contentin);
    } else {
      console.log('infoFetch failed', error, status);
    }

  }
  //tier 2 model tag added
  function categorize2(error, status, response) {
    if (!error && status == 200) {
      console.log("this msg belong to tier2: ", response); 
      if(response==101){
        console.log("tag not avaliable");
        var data = {
          "body": contentin,
          "group_id": selected_group_id,
          "topic1": topic1,
          "skip_body_notification":true
        };
      }
      else{
        var data = {
          "body": contentin,
          "group_id": selected_group_id,
          "topic1": topic1,
          "topic2": JSON.parse(response)[0],
          "topic3": JSON.parse(response)[1][0],
          "skip_body_notification":true
        };
      }
      
      console.log(data);
      autopost(data);
    } else {
      console.log('infoFetch failed', error, status);
    }
  }

  //read user input 
  function submitmsg() {
    disableButton(signin_button);
    tokenFetcher.getToken(true, function(error, access_token) {
      if (error) {
        showButton(signin_button);
      } else {
        contentin = document.getElementById("content").value;
        //console.log(contentin);
        categorymodel(contentin);
        
        
      }
    });
  }
  //update group id if dropdown window is updated
  function groupidupdate(){
    var selected_group=document.getElementById('groups').value;
    console.log(selected_group);
    var index = group_list.indexOf(selected_group);
    selected_group_id = groupid_list[index];
    console.log(groupid_list[index]);
  }

  return {

    //define buttons on the UI and call function when it is clicked
    onload: function () {
      signin_button = document.querySelector('#signin');
      signin_button.onclick = interactiveSignIn;

      revoke_button = document.querySelector('#revoke');
      revoke_button.onclick = revokeToken;

      submit_button = document.querySelector('#submit');
      submit_button.onclick = submitmsg;
      
      group_select_button = document.querySelector('#groups');
      group_select_button.onchange = groupidupdate;

      user_info_div = document.querySelector('#user_info');

      console.log(signin_button, revoke_button, submit_button, user_info_div);

      showButton(signin_button);
      getUserInfo(false);
    }
  };
})();


window.onload = gh.onload;
