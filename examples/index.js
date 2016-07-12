var WikiSocketCollection = require( './../index.js' );
//var Trender = require( 'Trender.js' );

var collection = new WikiSocketCollection( {
	id: 'mysocket',
  project: 'en.wikipedia.org',
	maxAge: 60,
	// Only keep things which are getting more than 5 edits per minute
	minSpeed: 5
} );

collection.on( 'change', function ( page, collection ) {
	console.log( '->', page.title, page.editsPerMinute() );
} );

setInterval( function () {
	function mostEdited() {
		var p = collection.getPages();
		p.sort( function ( q, r ) {
			return q.editsPerMinute() > r.editsPerMinute() ? -1 : 1;
		} );
		return p;
	}

	function mostChanged() {
		var p = collection.getPages();
		p.sort( function ( q, r ) {
			return q.bytesChanged > r.bytesChanged ? -1 : 1;
		} );
		return p;
	}

	function mostVibrant() {
		var p = collection.getPages();
		p.sort( function ( q, r ) {
			return q.getBias() > r.getBias() ? -1 : 1;
		} );
		return p;
	}

	function render( list, fn ) {
		list.slice( 0, 5 ).forEach( function ( page ) {
			console.log( page.title, fn( page ) )
		} );
	}

	console.log('### Most vibrant ### ');
	render( mostVibrant(), function ( page ) {
		return page.getBias();
	} );
	
	console.log('### Biggest movers ### ');
	render( mostChanged(), function ( page ) {
		return page.bytesChanged;
	} );

	console.log('### Most edited ### ');
	render( mostEdited(), function ( page ) {
		return page.editsPerMinute();
	} );
}, 1000 * 10 );

