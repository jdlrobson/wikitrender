const EventEmitter = require( 'events' );
var io = require( 'socket.io-client' );
var level = require( 'level' );
var rcCache = level( './db_collection' );
var WikiPage = require( './WikiPage.js' );

/**
 * A collection of pages that have recently been edited
 * @param {Object} options to pass to PageCollection
 * @param {String} options.project (e.g. *, *.wikipedia.org, en.wikipedia.org)
 * @param {Integer} options.maxLifespan a page can stay in the collection in minutes (defaults to 1 day)
 * @param {Integer} options.maxInactivity a page can stay in the collection in minutes without being updated (defaults to 60)
 * @param {Integer} options.minSpeed the minimum of edits per minute a page must achieve to stay in the collection
 * @param {Integer} options.minPurgeTime the minimum time a page can stay in the collection without being updated in minutes before being subject to purge (defaults to 5).
 */
function WikiSocketCollection( options ) {
	options = options || {};

	const maxLifespan = options.maxLifespan || 60 * 24;
	const maxInactivity = options.maxInactivity || 60;
	const minSpeed = options.minSpeed || 3;
	const minPurgeTime = options.minPurgeTime || 5;
	const emitter = new EventEmitter();
	var titles = this.titles = {};
	var socket = io.connect('stream.wikimedia.org/rc');
	var id = options.id || Math.random();
	var collection = this;

	if ( options.id ) {
		rcCache.get( options.id, function ( err, value ) {
			var rawTitles = {};
			if ( !err ) {
				rawTitles = JSON.parse( value );
				console.log('loaded!');
			} else {
				console.log('errr');
			}
			for ( i in rawTitles ) {
				data = rawTitles[i];
				titles[i] = new WikiPage( data.title, data );
			}
		} );
	}

	project = options.project || 'en.wikipedia.org';

	// Expose public methods
	this.on = function () {
		emitter.on.apply( emitter, arguments );
	};


	/**
	 * Update the collection with new information from the RC stream
	 * @param {Object} data as received from a rcstream
	 * @private
	 */
	function updateFromRCStream( data ) {
		/**
		 * @return {Boolean} whether the comment indicates the edit is a revert or a tag.
		 * @private
		 */
		function isRevert() {
			var comment = data.comment.toLowerCase();
			return comment.indexOf( 'tag:' ) > -1 ||
				comment.indexOf( 'undid' ) > -1 ||
				comment.indexOf( 'revert' ) > -1 ||
				comment.indexOf( 'reverting' ) > -1 ||
				comment.indexOf( 'wp:' ) > -1 ||
				comment.indexOf( 'reverted' ) > -1;
		}

		/**
		 * @return {Boolean} whether the username indicates an IP thus anon edit.
		 * @private
		 */
		function isIP() {
			var user = data.user;
			var match = user.match( /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[0-9A-E]+:[0-9A-E]+:[0-9A-E]+:[0-9A-E]+:[0-9A-E]+/ );
			return match && match[0];
		}

		/**
		 * @param {WikiPage} page to update based on editor information
		 */
		function updateFromEditor( page ) {
			var props = page;

			// if the editor is a new user add them to the list
			// @todo: use entity in this block
			if ( isIP( data.user ) ) {
				props.anonEdits +=1;
				if ( props.anons.indexOf( data.user ) === -1 ) {
					props.anons.push( data.user );
					props.distribution[data.user] = 1;
				} else {
					props.distribution[data.user]++;
				}
			} else {
				if ( props.contributors.indexOf( data.user ) === -1 ) {
					props.contributors.push( data.user );
					props.distribution[data.user] = 1;
				} else {
					props.distribution[data.user]++;
				}
			}
		}

		/**
		 * @param {WikiPage} page to update based on comment information
		 */
		function updateFromComment( page ) {
			var comment = data.comment.toLowerCase();

			if ( comment.indexOf( 'eventtag' ) > -1 ||
				comment.indexOf( 'current event' ) > -1 ||
				comment.indexOf( '→‎Death' ) > -1 ||
				comment.indexOf( 'ongoing event' ) > -1
			) {
				page.notabilityFlags++;
			}

			if ( comment.indexOf( 'proposing article for deletion' ) > -1 ) {
				page.volatileFlags++;
			}
		}

		var page = collection.getPage( data.title, data.wiki );
		// update new status
		if ( data.type === 'new' ) {
			page.isNew = true;
		}
		// update edit count/revert count
		if ( isRevert() ) {
			// don't count edits but note the revert.
			page.reverts++;
		} else {
			page.edits++;
		}
		// update bytes changed
		page.bytesChanged += ( data.length.new - data.length.old );
		// update information based on content of comment
		updateFromComment( page );
		// update information based on last editor
		updateFromEditor( page );
		// update it
		page.updated = new Date();
		// update the object;
		titles[ page.id ] = page;
	}

	/**
	 * @param {Object} edit
	 * @return {Boolean} whether the edit was performed by a bot.
	 * @private
	 */
	function isBotEdit( edit ) {
		// Some bots are not marked as a bot.
		var knownBots = [ 'ClueBot NG' ];
		return edit.bot || knownBots.indexOf( edit.user ) > - 1;
	}

	/**
	 * @param {String} comment associated with edit
	 * @private
	 * @return {Boolean} whether the comment indicates the edit fixed a previous bad edit.
	 */
	function isFixup( comment ) {
		return comment.indexOf( 'Fixed error' ) > -1;
	}
	// Connect to the websocket and start tracking.
	io.connect( 'stream.wikimedia.org/rc' )
		.on( 'connect', function () {
			socket.emit( 'subscribe', project );
		})
		.on( 'change', function ( data ) {
			// Ignore non-main namespace and anything abuse filter or tag related
			if ( data.namespace !== 0 || data["log_type"] ||
				isBotEdit( data ) || isFixup( data.comment ) ) {
				return;
			} else {
				updateFromRCStream( data );
				emitter.emit( 'edit', collection.getPage( data.title, data.wiki ), collection );
			}
		} );
		
	
	/**
	 * Internal clean process. Ensures we don't store edits for longer than necessary.
	 * @private
	 */
	function cleaner() {
		var i, wp, speed, age,
			live = 0, purged = 0,
			now = new Date();

		function drop( id) {
			purged++;
			delete titles[id];
		}
		for ( i in titles ) {
			if ( titles.hasOwnProperty( i ) ) {
				live++;
				wp = titles[i];
				speed = wp.editsPerMinute();
				age = wp.age();
				lastUp = wp.lastUpdated();
				// Only purge things that have been around for at least the minimum purge time
				if ( lastUp > minPurgeTime ) {
					if ( !wp.safe ) {
						if ( speed < minSpeed ) {
							drop( i );
						// Drop any oldies
						} else if ( age > maxLifespan || lastUp < maxInactivity ) {
							drop( i );
						}
					} else if ( age > maxLifespan ){
						drop( i );
					}
				}
			} else {
				console.log(i,wp.editsPerMinute() < minSpeed, wp.age() > maxAge)
			}
		}
		console.log('liivveee', live, 'purged', purged );
		// save result to cache
		if ( options.id ) {
			rcCache.put( options.id, JSON.stringify( titles ) );
		}
	}
	// cleanup every 20s
	setInterval( cleaner, 1000 * 20 );
}

WikiSocketCollection.prototype = {
	/**
	 * Mark a page as safe until the maximum age has been surpassed.
	 * @param {String} title of Page
	 * @param {Boolean} unsafe when flag given the title is marked as unsafe.
	 */
	markSafe: function ( title, unsafe ) {
		this.titles[title].safe = unsafe ? false : true;
	},
	/**
	 * @param {String} title of Page
	 * @param {String} wiki name
	 * @return {WikiPage} a page representing the edit with its current edit behaviour
	 */
	getPage: function ( title, wiki ) {
		var wp;
		if ( wiki === 'enwiki' ) {
			wiki = '';
		}
		var id = wiki ? wiki + '/' + title : title;
		if ( !this.titles[id] ) {
			wp = new WikiPage( title );
			wp.id = id;
			wp.wiki = wiki;
			this.titles[id] = wp;
		}
		return this.titles[id];
	},

	/**
	 * @return {WikiPage[]} of pages in collection
	 */
	getPages: function ( minSpeed ) {
		return Object.keys( this.titles ).map((t) => this.titles[t]);
	}
};

module.exports = WikiSocketCollection;
