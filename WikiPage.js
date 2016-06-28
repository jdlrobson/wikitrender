function WikiPage( title, props ) {
	var now = new Date();

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
		var mostProfilicEditCount = 0;

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
module.exports = WikiPage;
