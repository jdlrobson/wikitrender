var WikiSocketCollection = require( './../index.js' );
const NEW_LINE = `###########################`;
//var Trender = require( 'Trender.js' );

var collection = new WikiSocketCollection( {
	id: 'mysocket',
	project: 'en.wikipedia.org',
	maxAge: 60,
	// Only keep things which are getting more than 5 edits per minute
	minSpeed: 5,
	debug: true,
	clearCache: true
} );

collection.on( 'edit', function ( page, collection ) {
	console.log( `[info] ${page.title} was edited, it is currently being edited at ${page.editsPerMinute()} edits per minute` );
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

	console.log(NEW_LINE);
	console.log('### Most vibrant ### ');
	console.log(NEW_LINE);
	render( mostVibrant(), function ( page ) {
		return page.getBias();
	} );
	
	console.log(NEW_LINE);
	console.log('### Biggest movers ### ');
	console.log(NEW_LINE);
	render( mostChanged(), function ( page ) {
		return page.bytesChanged;
	} );

	console.log(NEW_LINE);
	console.log('### Most edited ### ');
	console.log(NEW_LINE);
	render( mostEdited(), function ( page ) {
		return page.editsPerMinute();
	} );
	console.log(NEW_LINE);
}, 1000 * 10 );

