# Wikitrender

A wrapper for the (https://wikitech.wikimedia.org/wiki/EventStreams)Wikimedia EventStream for monitoring edit
activity on Wikimedia projects e.g. Wikipedia over an extended period of time.

Sample code:

	var WikiSocketCollection = require( 'wikitrender' );

	var collection = new WikiSocketCollection( {
		id: 'mysocket',
	  project: 'en.wikipedia.org', // wiki you want to subscribe to
		minPurgeTime: 10, // every 10 minutes a purge will happen clearing pages...
		// ...it will only happen for pages that have not been marked as safe (see below) AND where... 
		maxLifespan: 180, // ... the page was first edited 180 mins ago
		minSpeed: 5 // ... OR the speed of editing on the page is less than 5 edits per minute
		maxInactivity: 60, // ... OR there have been no edits in the last 60 minutes
		} );

	collection.on( 'edit', function ( page, collection ) {
		console.log( '->', page.title, page.editsPerMinute() );
		if ( page.title === 'Kittens' ) {
			// IF an item is marked as 
			collection.markSafe( page.id );
		}
	} );