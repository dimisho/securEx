var currentTabID;
var isTabIncognito = false;
var cookieList = [];
var currentLayout = "none";
var lastInput = "";

$.fx.speeds._default = 200;

jQuery(document).ready(function () {
  ++data.nPopupClicked;
  start();

  /**
   * Force Repaint
   * Temporary workaround for Chromium #428044 bug
   * https://bugs.chromium.org/p/chromium/issues/detail?id=428044#c35
   */
  let body = $("body").css("display", "none");
  setTimeout(() => {
    body.css("display", "");
  }, 100);
});

function start() {
  var arguments = getUrlVars();
  if (arguments.url === undefined) {
    chrome.tabs.query(
      {
        active: true,
        lastFocusedWindow: true,
      },
      function (tabs) {
        let currentTabURL = tabs[0].url;
        currentTabID = tabs[0].id;
        $("input", "#cookieSearchCondition").val(currentTabURL);
        document.title = document.title + "-" + currentTabURL;
        doSearch(false);
      }
    );
  } else {
    var url = decodeURI(arguments.url);
    currentTabID = parseInt(decodeURI(arguments.id));
    isTabIncognito = decodeURI(arguments.incognito) === "true";
    $("input", "#cookieSearchCondition").val(url);
    document.title = document.title + "-" + url;
    doSearch(true);
  }
}

function getUrlOfCookies() {
  return $("input", "#cookieSearchCondition").val();
}

function doSearch(isSeparateWindow) {
  var url = $("input", "#cookieSearchCondition").val();
  if (url.length < 3) return;
  var filter = new Filter();
  if (/^https?:\/\/.+$/.test(url)) {
    filter.setUrl(url);
  } else {
    filter.setDomain(url);
  }
  createList(filter.getFilter(), isSeparateWindow);
}

function submit(currentTabID) {
  submitAll(currentTabID);
}

function submitAll(currentTabID) {
  var cookies = $(".cookie", "#cookiesList");
  var nCookiesToUpdate = cookies.length;

  var onUpdateComplete = function () {
    data.nCookiesChanged += cookies.length;
    if (preferences.refreshAfterSubmit) {
      chrome.tabs.reload(currentTabID, {
        bypassCache: preferences.skipCacheRefresh,
      });
    }
    doSearch();
  };

  cookies.each(function () {
    var cCookie = formCookieData($(this));

    if (cCookie === undefined) {
      return;
    }

    deleteCookie(cCookie.url, cCookie.name, cCookie.storeId, function () {
      chrome.cookies.set(cCookie, function () {
        if (--nCookiesToUpdate === 0) {
          onUpdateComplete();
        }
      });
    });
  });
}

function createList(filters, isSeparateWindow) {
  var filteredCookies = [];

  if (filters === null) filters = {};

  var filterURL = {};
  if (filters.url !== undefined) filterURL.url = filters.url;
  if (filters.domain !== undefined) filterURL.domain = filters.domain;

  if (!isSeparateWindow) {
    $("#submitDiv").css({
      bottom: 0,
    });
  } else {
    $("#submitDiv").addClass("submitDivSepWindow");
  }

  chrome.cookies.getAllCookieStores(function (cookieStores) {
    for (let x = 0; x < cookieStores.length; x++) {
      if (cookieStores[x].tabIds.indexOf(currentTabID) != -1) {
        filterURL.storeId = cookieStores[x].id;
        break;
      }
    }

    chrome.cookies.getAll(filterURL, function (cks) {
      var currentC;
      for (var i = 0; i < cks.length; i++) {
        currentC = cks[i];

        if (
          filters.name !== undefined &&
          currentC.name.toLowerCase().indexOf(filters.name.toLowerCase()) === -1
        )
          continue;
        if (
          filters.domain !== undefined &&
          currentC.domain
            .toLowerCase()
            .indexOf(filters.domain.toLowerCase()) === -1
        )
          continue;
        if (
          filters.secure !== undefined &&
          currentC.secure
            .toLowerCase()
            .indexOf(filters.secure.toLowerCase()) === -1
        )
          continue;
        if (
          filters.session !== undefined &&
          currentC.session
            .toLowerCase()
            .indexOf(filters.session.toLowerCase()) === -1
        )
          continue;

        for (var x = 0; x < data.readOnly.length; x++) {
          try {
            var lock = data.readOnly[x];
            if (
              lock.name === currentC.name &&
              lock.domain === currentC.domain
            ) {
              currentC.isProtected = true;
              break;
            }
          } catch (e) {
            console.error(e.message);
            delete data.readOnly[x];
          }
        }
        filteredCookies.push(currentC);
      }
      cookieList = filteredCookies;

      $("#cookiesList").empty();

      if (cookieList.length === 0) {
        swithLayout();
        setEvents();
        return;
      }

      cookieList.sort(function (a, b) {
        if (preferences.sortCookiesType === "domain_alpha") {
          var compDomain = a.domain
            .toLowerCase()
            .localeCompare(b.domain.toLowerCase());
          if (compDomain) return compDomain;
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      createAccordionList(cookieList, function () {
        swithLayout();
        setEvents();
        $("input:checkbox").uniform();
      });
    });
  });
}

function createAccordionList(cks, callback, callbackArguments) {
  let createAccordionCallback = callback;
  let createAccordionCallbackArguments = callbackArguments;

  try {
    $("#cookiesList").accordion("destroy");
  } catch (e) {
    console.warn(e.message);
  }

  if (cks === null) cks = cookieList;
  for (var i = 0; i < cks.length; i++) {
    currentC = cks[i];

    var domainText = "";
    if (preferences.showDomain) {
      domainText = currentC.domain;
      if (preferences.showDomainBeforeName) {
        domainText = domainText + " | ";
      } else {
        domainText = " | " + domainText;
      }
    }

    var titleText;
    if (preferences.showDomainBeforeName) {
      titleText = $("<p/>")
        .text(domainText)
        .append($("<b/>").text(currentC.name));
      if (currentC.isProtected)
        $(":first-child", titleText).css("color", "green");
    } else {
      titleText = $("<p/>")
        .append($("<b/>").text(currentC.name))
        .append($("<span/>").text(domainText));
    }

    var vulnerabilityText;
    vulnerabilityText = $("<h3/>");
    vulnerabilityText.attr("style", "color: white; margin: 0");

    var titleElement = $("<div/>")
      .append($("<a/>").html(titleText.html()).attr("href", "#"))
      .append(vulnerabilityText);
    var titleElementStyle =
      "display: flex; justify-content: space-between; padding: 8px 32px; ";

    var cookie = $(".cookie_details_template")
      .clone()
      .removeClass("cookie_details_template");

    $(".index", cookie).val(i);
    $(".name", cookie).val(currentC.name);
    $(".value", cookie).val(currentC.value);
    $(".domain", cookie).val(currentC.domain);
    $(".path", cookie).val(currentC.path);
    $(".storeId", cookie).val(currentC.storeId);
    $(".sameSite", cookie).val(currentC.sameSite);

    if (currentC.isProtected) $(".unprotected", cookie).hide();
    else $(".protected", cookie).hide();

    if (currentC.hostOnly) {
      $(".domain", cookie).attr("disabled", "disabled");
      $(".hostOnly", cookie).prop("checked", true);
    }
    if (currentC.secure) {
      $(".secure", cookie).prop("checked", true);
    }
    if (currentC.httpOnly) {
      $(".httpOnly", cookie).prop("checked", true);
    } else {
      vulnerabilityText.text("XSS");
      titleElementStyle += "background: rgba(255, 0, 0, 0.7); ";
    }
    if (currentC.session) {
      $(".expiration", cookie).attr("disabled", "disabled");
      $(".session", cookie).prop("checked", true);
    }

    var expDate;
    if (currentC.session) {
      expDate = new Date();
      expDate.setFullYear(expDate.getFullYear() + 1);
    } else {
      expDate = new Date(currentC.expirationDate * 1000.0);
    }
    $(".expiration", cookie).val(expDate);

    titleElement.attr("style", titleElementStyle);
    $("#cookiesList").append(titleElement);
    $("#cookiesList").append(cookie);
  }

  $("#cookiesList").accordion({
    autoHeight: false,
    heightStyle: "content",
    collapsible: true,
    active: cks.length - 1,
    create: function (event, ui) {
      $.uniform.update();
      if (createAccordionCallback !== undefined)
        createAccordionCallback(createAccordionCallbackArguments);
    },
  });
}

function setEvents() {
  $("#submitButton:first-child")
    .unbind()
    .click(function () {
      submit(currentTabID);
    });
  if (cookieList.length > 0) {
    $("#submitDiv").show();
  }
  $("#submitFiltersButton").button();

  $("#submitFiltersDiv")
    .unbind()
    .click(function () {
      var domainChecked =
        $(".filterDomain:checked", $(this).parent()).val() !== undefined;
      var domain = $("#filterByDomain", $(this).parent()).text();
      var nameChecked =
        $(".filterName:checked", $(this).parent()).val() !== undefined;
      var name = $("#filterByName", $(this).parent()).text();
      var valueChecked =
        $(".filterValue:checked", $(this).parent()).val() !== undefined;
      var value = $("#filterByValue", $(this).parent()).text();

      var newRule = {};
      if (domainChecked) newRule.domain = domain;
      if (nameChecked) newRule.name = name;
      if (valueChecked) newRule.value = value;

      for (var i = 0; i < cookieList.length; i++) {
        var currentCookie = cookieList[i];
        if (currentCookie.isProtected) continue;
        if (
          !filterMatchesCookie(
            newRule,
            currentCookie.name,
            currentCookie.domain,
            currentCookie.value
          )
        )
          continue;

        var url = buildUrl(
          currentCookie.domain,
          currentCookie.path,
          getUrlOfCookies()
        );
        deleteCookie(url, currentCookie.name, currentCookie.storeId);
      }
      data.nCookiesFlagged += cookieList.length;
      var exists = addBlockRule(newRule);

      doSearch();
      return;
    });

  if (preferences.showCommandsLabels) {
    $(".commands-row", ".commands-table").addClass("commands-row-texy");
  }

  $("#refreshButton")
    .unbind()
    .click(function () {
      location.reload(true);
    });

  $("#optionsButton")
    .unbind()
    .click(function () {
      var urlToOpen = chrome.extension.getURL("options_main_page.html");
      chrome.tabs.create({
        url: urlToOpen,
      });
    });

  $("#searchButton")
    .unbind()
    .click(function () {
      $("#searchField").focus();
      $("#searchField").fadeIn("normal", function () {
        $("#searchField").focus();
      });
      $("#searchField").focus();
    });

  $("#searchBox")
    .unbind()
    .focusout(function () {
      $("#searchField").fadeOut();
    });

  $("#searchField")
    .unbind()
    .keyup(function () {
      find($(this).val());
    });
  $("input", "#cookieSearchCondition").unbind().keyup(doSearch);

  $(".toast").each(function () {
    $(this).css("margin-top", "-" + $(this).height() / 2 + "px");
    $(this).css("margin-left", "-" + $(this).width() / 2 + "px");
  });

  $("textarea.value, input.domain, input.path").keydown(function (event) {
    if (event.ctrlKey && event.keyCode === 13) {
      submit(currentTabID);
      console.log("trigger save (submit)");
      event.preventDefault();
      event.stopPropagation();
    }
  });

  setCookieEvents();
}

function setCookieEvents() {
  $(".hostOnly").click(function () {
    var cookie = $(this).closest(".cookie");
    var checked = $(this).prop("checked");
    if (!!checked) $(".domain", cookie).attr("disabled", "disabled");
    else $(".domain", cookie).removeAttr("disabled");
  });

  $(".session").click(function () {
    var cookie = $(this).closest(".cookie");
    var checked = $(this).prop("checked");
    if (!!checked) $(".expiration", cookie).attr("disabled", "disabled");
    else $(".expiration", cookie).removeAttr("disabled");
  });

  $(".deleteOne").click(function () {
    var cookie = $(this).closest(".cookie");
    var name = $(".name", cookie).val();
    var domain = $(".domain", cookie).val();
    var path = $(".path", cookie).val();
    var secure = $(".secure", cookie).prop("checked");
    var storeId = $(".storeId", cookie).val();
    var okFunction = function () {
      var url = buildUrl(domain, path, getUrlOfCookies());
      deleteCookie(url, name, storeId, function (success) {
        if (success === true) {
          var head = cookie.prev("h3");
          cookie.add(head).slideUp(function () {
            $(this).remove();
            swithLayout();
          });
        } else {
          location.reload(true);
        }
      });
      ++data.nCookiesDeleted;
    };
    startAlertDialog(
      _getMessage("Alert_deleteCookie") + ': "' + name + '"?',
      okFunction
    );
  });
  $(".flagOne").click(function () {
    var cookie = $(this).closest(".cookie");
    var domain = $(".domain", cookie).val();
    var name = $(".name", cookie).val();
    var value = $(".value", cookie).val();

    $("#filterByDomain", "#cookieFilter").text(domain);
    $("#filterByName", "#cookieFilter").text(name);
    $("#filterByValue", "#cookieFilter").text(value);

    swithLayout("flag");
  });

  $(".protectOne").click(function () {
    var cookie = $(this).closest(".cookie");
    var titleName = $("b", cookie.prev()).first();
    var index = $(".index", cookie).val();
    isProtected = switchReadOnlyRule(cookieList[index]);

    cookieList[index].isProtected = isProtected;
    if (isProtected) {
      $(".unprotected", cookie).fadeOut("fast", function () {
        $(".protected", cookie).fadeIn("fast");
      });
      titleName.css("color", "green");
    } else {
      $(".protected", cookie).fadeOut("fast", function () {
        $(".unprotected", cookie).fadeIn("fast");
      });
      titleName.css("color", "#000");
    }
  });
}

function startAlertDialog(title, ok_callback, cancel_callback) {
  if (ok_callback == undefined) {
    return;
  }
  if (!preferences.showAlerts) {
    ok_callback();
    return;
  }

  $("#alert_ok")
    .unbind()
    .click(function () {
      $("#alert_wrapper").hide();
      ok_callback();
    });

  if (cancel_callback !== undefined) {
    $("#alert_cancel").show();
    $("#alert_cancel")
      .unbind()
      .click(function () {
        $("#alert_wrapper").hide("fade");
        cancel_callback();
      });
  } else {
    $("#alert_cancel").hide();
  }
  $("#alert_title_p").empty().text(title);
  $("#alert_wrapper").show("fade");
}

function find(pattern) {
  if (pattern === lastInput) return;

  lastInput = pattern;
  $($(".cookie", "#cookiesList").get().reverse()).each(function () {
    var name = $(".name", $(this)).val();
    var node = $(this);
    var h3 = $(this).prev();
    if (
      pattern !== "" &&
      name.toLowerCase().indexOf(pattern.toLowerCase()) !== -1
    ) {
      h3.addClass("searchResult");
      node.detach();
      h3.detach();
      $("#cookiesList").prepend(node);
      $("#cookiesList").prepend(h3);
    } else {
      h3.removeClass("searchResult");
    }
  });
  $("#cookiesList").accordion("option", "collapsible", "true");
  $("#cookiesList").accordion("option", "active", cookieList.length);
}

function swithLayout(newLayout) {
  if (newLayout === undefined) {
    if ($("h3", "#cookiesList").length) {
      newLayout = "list";
    } else {
      newLayout = "empty";
    }
  }

  if (currentLayout === newLayout) return;
  currentLayout = newLayout;

  if (newLayout === "list" || newLayout === "empty") {
    $("#cookieFilter").slideUp();
    $("#submitFiltersButton").slideUp();
  }

  if (newLayout === "list") {
    $(".commands-table")
      .first()
      .animate({ opacity: 0 }, function () {
        $("#searchButton").show();
        $(".commands-table").first().animate({ opacity: 1 });
        $("#cookieSearchCondition").show();
      });
    $("#noCookies").slideUp();
    $("#cookiesList").slideDown();
    $("#submitDiv").show();
  } else if (newLayout === "empty") {
    $(".commands-table")
      .first()
      .animate({ opacity: 0 }, function () {
        $("#searchButton").hide();
        $(".commands-table").first().animate({ opacity: 1 });
        $("#cookieSearchCondition").show();
      });
    $(".notOnEmpty").hide();
    $("#noCookies").slideDown();
    $("#cookiesList").slideUp();
    $("#submitDiv").hide();
  } else {
    $(".commands-table")
      .first()
      .animate({ opacity: 0 }, function () {
        $("#searchButton").hide();
        $(".commands-table").first().animate({ opacity: 1 });
      });

    $("#noCookies").slideUp();
    $("#cookiesList").slideUp();
    $("#cookieSearchCondition").slideUp();

    if (newLayout === "flag") {
      $("#submitFiltersButton").slideDown();
      $("#cookieFilter").slideDown();
      $("#submitDiv").slideUp();
    } else if (newLayout === "new") {
      $("#cookieFilter").slideUp();
      $("#submitFiltersButton").slideUp();
      $("#submitDiv").slideDown();
    }
  }
}

function formCookieData(form) {
  var index = $(".index", form).val();
  var name = $(".name", form).val();
  var value = $(".value", form).val();
  var domain = $(".domain", form).val();
  var hostOnly = $(".hostOnly", form).prop("checked");
  var path = $(".path", form).val();
  var secure = $(".secure", form).prop("checked");
  var httpOnly = $(".httpOnly", form).prop("checked");
  var session = $(".session", form).prop("checked");
  var storeId = $(".storeId", form).val();
  var expiration = $(".expiration", form).val();
  var sameSite = $(".sameSite", form).val();

  var newCookie = {};
  newCookie.url = buildUrl(domain, path, getUrlOfCookies());
  newCookie.name = name.replace(";", "").replace(",", "");
  value = value.replace(";", "");
  newCookie.value = value;
  newCookie.path = path;
  newCookie.storeId = storeId;
  if (!hostOnly) newCookie.domain = domain;
  if (!session) {
    var expirationDate = new Date(expiration).getTime() / 1000;
    newCookie.expirationDate = expirationDate;

    // If the expiration date is not valid, tell the user by making the
    // invalid date red and showing it in the accordion
    if (isNaN(expirationDate)) {
      console.log("Invalid date");
      $(".expiration", form).addClass("error");
      $(".expiration", form).focus();
      if (index !== undefined) {
        // This is an existing cookie, not a new one
        $("#cookiesList").accordion("option", "active", parseInt(index));
      }
      return undefined;
    } else {
      $(".expiration", form).removeClass("error");
    }
  }
  newCookie.secure = secure;
  newCookie.httpOnly = httpOnly;
  newCookie.sameSite = sameSite;

  return newCookie;
}
