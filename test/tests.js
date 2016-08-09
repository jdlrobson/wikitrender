var assert = require( 'assert' );
var WikiSocketCollection = require( './../index.js' );

const EventEmitter = require( 'events' );

describe('WikiSocketCollection', function() {
  var mockSocket = new EventEmitter();
  var collection = new WikiSocketCollection( {
    _socket: mockSocket
  } );
  
  it('should should keep track of an edit', function() {

    // edit
    mockSocket.emit( 'change', { title: 'Foo', comment: 'yo', namespace: 0, user: 'Jon', length: { new: 2, old: 1 } } );

    var pages = collection.getPages();
    assert.equal( pages.length, 1 );

    var page = pages[0];
    assert.equal( page.title, 'Foo' );
    assert.equal( page.bytesChanged, 1 );
  });
});
