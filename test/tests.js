var assert = require( 'assert' );
var WikiSocketCollection = require( './../index.js' );

const rawEdit = { title: 'Foo', comment: 'yo',
  namespace: 0, user: 'Jon',
  length: { new: 2, old: 1 },
  wiki: 'enwiki',
  server_name: 'en.wikipedia.org'
};

const edit = JSON.stringify( rawEdit );
const afd = JSON.stringify({
  title: 'Foo', comment: 'Nominated page for deletion', namespace: 0, user: 'Vandal',
  length: { new: 2, old: 1 },
  server_name: 'en.wikipedia.org',
  wiki: 'enwiki' });

const rawRevert = {
  title: 'Foo', comment: 'reverted', namespace: 0, user: 'Reverter',
  length: { new: 2, old: 1 },
	server_name: 'en.wikipedia.org',
	wiki: 'enwiki' };

const revert = JSON.stringify( rawRevert );
const botEdit = JSON.stringify( Object.assign( {}, rawEdit, { bot: true } ) );
const botRevert = JSON.stringify( Object.assign( {}, rawRevert, { bot: true } ) );

describe('WikiSocketCollection', function() {
  var collection = new WikiSocketCollection();
  var mockSocket = collection._socket;
  
  it( 'isIP', function() {
    assert.ok( WikiSocketCollection.isIP( '2A02:27B0:4400:33F0:E0FF:19DF:B401:9559' ) );
    assert.ok( !WikiSocketCollection.isIP( 'Jdlrobson' ) );
    assert.ok( WikiSocketCollection.isIP( '192.168.0.1' ) );
  } );

  it('should should keep track of an edit', function() {

    // edit
    mockSocket.onmessage( { data: edit } );

    var pages = collection.getPages();
    assert.equal( pages.length, 1 );

    var page = pages[0];
    assert.equal( page.title, 'Foo' );
    assert.equal( page.bytesChanged, 1 );
  });

  it('should be possible to drop a page.', function() {

    // edit
    mockSocket.onmessage( { data: edit } );
    // drop
    collection.drop( 'Foo', 'enwiki' );

    assert.equal( collection.getPages().length, 0 );
  });

  it('should remove the old page during a rename', function() {

    // edit
    mockSocket.onmessage( { data: edit } );
    // rename
    mockSocket.onmessage( { data:
      JSON.stringify({
        namespace: 0, comment: 'Because', wiki: 'enwiki',
        title: 'Foo',
        log_type: 'log', log_action: 'move',
        log_params: { target: 'FoO' }
      })
    } );

    assert.equal( collection.getPages().length, 1 );
  });

  it('bot edits', function() {
    collection = new WikiSocketCollection();
    mockSocket = collection._socket;
    // edit
    mockSocket.onmessage( { data: botEdit } );

    var pages = collection.getPages();
    assert.equal( pages.length, 1 );

    var page = pages[0];
    assert.equal( page.title, 'Foo' );
    assert.equal( page.edits, 0, 'Bots cannot impact edits' );
    assert.equal( page.bytesChanged, 0, 'Bots do not impact bytes changed unless reverting.' );
    assert.equal( page.contributors.length, 0,
      'Bots are not listed as contributors' );
  });

  it('a revert is counted', function() {
    collection = new WikiSocketCollection();
    mockSocket = collection._socket;

    // edit
    mockSocket.onmessage( { data: revert } );

    const page = collection.getPages()[0];
    assert.equal( page.reverts, 1 );
    assert.equal( page.edits, 0, 'Reverts do not count as edits' );
    assert.equal( page.contributors.length, 0,
      'Reverters are not listed as contributors' );
  });

  it('a revert by a bot is counted', function() {
    collection = new WikiSocketCollection();
    mockSocket = collection._socket;

    // edit
    mockSocket.onmessage( { data: botRevert } );

    const page = collection.getPages()[0];
    assert.equal( page.reverts, 1 );
    assert.equal( page.bytesChanged, 1, 'Reverts by bots influence bytes changed.' );
    assert.equal( page.edits, 0, 'Reverts do not count as edits' );
  });

  it('should scan edit summaries for clues to volatileness', function() {
    collection = new WikiSocketCollection();
    mockSocket = collection._socket;

    // edit
    mockSocket.onmessage( { data: edit } );
    // rename
    mockSocket.onmessage( { data: afd } );

    assert.equal( collection.getPages()[0].volatileFlags, 1 );
  });
});
