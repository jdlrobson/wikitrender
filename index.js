const EventEmitter = require( 'events' );
var io = require( 'socket.io-client' );
var level = require( 'level' );
var rcCache = level( './db_collection' );

function WikiPage( title, props ) {
	var key,
		now = new Date();

	props = props || {
		title: title,
		edits: 0,
		anonEdits: 0,
		isNew: false,
		// How many times an edit suggested the page was notable
		notabilityFlags: 0,
		volatileFlags: 0,
		reverts: 0,
		start: now,
		updated: now,
		contributors: [],
		anons: [],
		distribution: {},
		bytesChanged: 0
	};
	for ( key in props ) {
		if ( props.hasOwnProperty( key ) ) {
			this[key] = props[key];
		}
	}

	if ( typeof this.start === 'string' ) {
		this.start = new Date( this.start );
	}
	if ( typeof this.updated === 'string' ) {
		this.updated = new Date( this.updated );
	} else if ( typeof this.updated === undefined ) {
		this.updated = this.start;
	}
}
WikiPage.prototype = {
	/**
	 * See how biased editing behaviour is on the current page
	 * @returns {Integer} between 1 and 0. The higher the number the more biased the article
	 * and current edit activity is to a single author.
	 */
	getBias: function () {
		var user,
			mostProfilicEditCount = 0;

		// Calculate bias score
		for ( user in this.distribution ) {
			if ( this.distribution.hasOwnProperty( user ) ) {
				if ( this.distribution[user] > mostProfilicEditCount ) {
					mostProfilicEditCount = this.distribution[user]
				}
			}
		}
		return mostProfilicEditCount / this.edits;
	},
	/**
	 * Work out how long the page has been in the collection
	 * @returns {Float} age in minutes
	 */
	age: function () {
		var now = new Date();
		return ( now - this.start ) / 1000 / 60;
	},
	/**
	 * Work out how long since the page was last updated
	 * @returns {Float} age in minutes since last update
	 */
	lastUpdated: function () {
		var now = new Date();
		return ( now - this.updated ) / 1000 / 60;
	},
	/**
	* The current speed of edits to the given article
	* @returns {Float} edits per minute
	*/
	editsPerMinute: function ( includeReverts, includeAnons ) {
		var age = this.age(),
			editCount = includeReverts ? this.edits + this.reverts : this.edits;

		if ( includeAnons ) {
			editCount += this.anonEdits;
		}
		return age < 1 || editCount === 0 ? editCount : editCount / age;
	}
};

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
	var i, data, project;
	options = options || {};

	const maxLifespan = options.maxLifespan || 60 * 24;
	const maxInactivity = options.maxInactivity || 60;
	const minSpeed = options.minSpeed || 3;
	const minPurgeTime = options.minPurgeTime || 5;
	const emitter = new EventEmitter();
	var titles = this.titles = {};
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
	 * @param {String} oldTitle of page to update
	 * @param {String} newTitle of page to update
	 */
	function renamePage( title, wiki, newTitle ) {
		var page = collection.getPage( title, wiki );
		var newPage = collection.getPage( newTitle, wiki );
		console.log( 'rename', title, ' to ', newTitle );

		// remove old one
		collection.drop( page.title, wiki );
		// update old page with new id and title
		page.id = newPage.id;
		page.title = newPage.title;
		page.updated = new Date();
		// update the object with the new id and title
		titles[ page.id ] = page;
	}

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
		function isRevert( comment ) {
			comment = comment.toLowerCase();
			return comment.indexOf( 'tag:' ) > -1 ||
				comment.indexOf( 'undid' ) > -1 || //2
				comment.indexOf( 'revert' ) > -1 || // 4
				comment.indexOf( 'reverting' ) > -1 || // 1
				comment.indexOf( 'wp:' ) > -1 || // 1
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
				comment.indexOf( '→Death' ) > -1 ||
				comment.indexOf( 'ongoing event' ) > -1
			) {
				page.notabilityFlags++;
			}

			if (
				comment.indexOf( 'speedy deletion' ) > -1 ||
				comment.indexOf( 'nominated for deletion' ) > -1 ||
				comment.indexOf( 'nominated page for deletion' ) > -1 ||
				comment.indexOf( 'restore afd template' ) > -1 ||
				comment.indexOf( '{{pp-vandalism' ) > -1 ||
				comment.indexOf( 'proposing article for deletion' ) > -1
			) {
				page.volatileFlags++;
			}
		}

		var page = collection.getPage( data.title, data.wiki );
		// update new status
		if ( data.type === 'new' ) {
			page.isNew = true;
		}
		// update edit count/revert count
		if ( isRevert( data.comment ) ) {
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
	var socket = options._socket || io.connect('stream.wikimedia.org/rc');
	socket
		.on( 'connect', function () {
			console.log('connected');
			socket.emit( 'subscribe', project );
		})
		.on( 'change', function ( data ) {
			var params, action;
			// Ignore non-main namespace and anything abuse filter or tag related
			if ( data.namespace !== 0 ||
				isBotEdit( data ) || isFixup( data.comment ) ) {
				return;
			} else if ( data.log_type ) {
				params = data.log_params;
				action = data.log_action;

				if ( action === 'move' ) {
					renamePage( data.title, data.wiki, params.target );
				} else if ( action === 'protect' ) {
					collection.protectPage( data.title, data.wiki );
				} else if ( action === 'delete' ) {
					if ( !params.length ) {
						params = data.log_action_comment.match( /&quot;\[\[(.*)\]\]&quot;|&quot;(.*)&quot;/ );
						params = params ? params[1] || params[2] : false;
						if ( params ) {
							console.log( 'attempt delete', params);
							collection.drop(params, data.wiki);
						}
					}
				}
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
		var i, wp, speed, age, lastUp,
			live = 0, purged = 0;

		function drop( id ) {
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
	 * @param {String} id of Page
	 * @param {Boolean} unsafe when flag given the title is marked as unsafe.
	 */
	markSafe: function ( id, unsafe ) {
		this.titles[id].safe = unsafe ? false : true;
	},
	/**
	 * Mark a page as being protected.
	 * @param {String} title of Page
	 * @param {String} wiki of Page
	 */
	protectPage: function ( title, wiki ) {
		var id = wiki + '/' + title;
		if ( this.titles[id] ) {
			this.titles[id].isProtected = true;
		}
	},
	/**
	 * Mark a page as safe until the maximum age has been surpassed.
	 * @param {String} id of page to drop.
	 */
	drop: function ( title, wiki ) {
		var id = wiki === 'enwiki' ? title : wiki + '/' + title;
		delete this.titles[id];
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
	getPages: function () {
		return Object.keys( this.titles ).map((t) => this.titles[t]);
	}
};

module.exports = WikiSocketCollection;
