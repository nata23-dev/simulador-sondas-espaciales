$(document).ready(function() {
  $.ajax({

    url: "/dat/horizons_news.txt",
    dataType: "text",
    async: true,
    success: function (contents) {
      //console.log('DEBUG: contents length:',contents.length);
      var elem = $('#horizons_news');
      //console.log('DEBUG: html:',elem.html());
      $('#horizons_news').html('<pre>'+contents+'</pre>');
    },
    error: function (xhr, type, reason) {
      console.log('ERROR: unable to GET news_file:',reason);
      $('#horizons_news').html('<p></em>currently not available, please try later</em></p>');
    }
  });
});
