package uizoom

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework WebKit
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

// WailsWebView is the class Wails v2 gives the app's webview. Matching plain WKWebView would also
// find the docked Web Inspector, which is a WKWebView of its own.
static WKWebView *findWebView(NSView *view) {
	Class wailsWebView = NSClassFromString(@"WailsWebView");
	if (wailsWebView != nil && [view isKindOfClass:wailsWebView]) {
		return (WKWebView *)view;
	}
	for (NSView *sub in view.subviews) {
		WKWebView *found = findWebView(sub);
		if (found != nil) {
			return found;
		}
	}
	return nil;
}

// WKWebView.pageZoom is macOS 11+, and App Lab still declares 10.13 as its minimum.
static int pageZoomAvailable(void) {
	if (@available(macOS 11.0, *)) {
		return 1;
	}
	return 0;
}

static void setPageZoom(double factor) {
	if (@available(macOS 11.0, *)) {
		dispatch_async(dispatch_get_main_queue(), ^{
			for (NSWindow *window in [NSApp windows]) {
				WKWebView *webview = findWebView(window.contentView);
				if (webview != nil) {
					webview.pageZoom = factor;
				}
			}
		});
	}
}
*/
import "C"

func set(factor float64) {
	C.setPageZoom(C.double(factor))
}

// Available reports whether set can change the zoom on this machine.
func Available() bool { return C.pageZoomAvailable() != 0 }
