var assert = require( 'assert' );
var WikiSocketCollection = require( './../index.js' );

const EventEmitter = require( 'events' );

const edit = { title: 'Foo', comment: 'yo', namespace: 0, user: 'Jon', length: { new: 2, old: 1 }, wiki: 'enwiki' };
const afd = { title: 'Foo', comment: 'Nominated page for deletion', namespace: 0, user: 'Vandal', length: { new: 2, old: 1 }, wiki: 'enwiki' };

describe('WikiSocketCollection', function() {
  var mockSocket = new EventEmitter();
  var collection = new WikiSocketCollection( {
    _socket: mockSocket
  } );
  
  it( 'isIP', function() {
    assert.ok( WikiSocketCollection.isIP( '2A02:27B0:4400:33F0:E0FF:19DF:B401:9559' ) );
    assert.ok( !WikiSocketCollection.isIP( 'Jdlrobson' ) );
    assert.ok( WikiSocketCollection.isIP( '192.168.0.1' ) );
  } );

  it('should should keep track of an edit', function() {

    // edit
    mockSocket.emit( 'change', edit );

    var pages = collection.getPages();
    assert.equal( pages.length, 1 );

    var page = pages[0];
    assert.equal( page.title, 'Foo' );
    assert.equal( page.bytesChanged, 1 );
  });

  it('should be possible to drop a page.', function() {

    // edit
    mockSocket.emit( 'change', edit );
    // drop
    collection.drop( 'Foo', 'enwiki' );

    assert.equal( collection.getPages().length, 0 );
  });

  it('should remove the old page during a rename', function() {

    // edit
    mockSocket.emit( 'change', edit );
    // rename
    mockSocket.emit( 'change', { namespace: 0, comment: 'Because', wiki: 'enwiki',
      title: 'Foo',
      log_type: 'log', log_action: 'move', log_params: { target: 'FoO' } } );

    assert.equal( collection.getPages().length, 1 );
  });

  it('should scan edit summaries for clues to volatileness', function() {
    collection = new WikiSocketCollection( {
      _socket: mockSocket
    } );

    // edit
    mockSocket.emit( 'change', edit );
    // rename
    mockSocket.emit( 'change', afd );

    assert.equal( collection.getPages()[0].volatileFlags, 1 );
  });
});
