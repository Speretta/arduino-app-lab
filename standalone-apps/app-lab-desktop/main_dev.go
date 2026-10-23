//go:build dev

package main

import "net/http"

// The `wails dev` proxy to Vite has no Transport of its own, so it uses
// http.DefaultTransport. Over plain HTTP it opens one connection per module
// request; the first page load sends several hundred at once, more than the
// macOS listen queue for Vite's socket holds (kern.ipc.somaxconn = 128), and
// the overflow is reset. Over HTTPS (a mkcert certificate in dev-config) the
// proxy uses HTTP/2 on one connection and this cap has no effect.
func init() {
	http.DefaultTransport.(*http.Transport).MaxConnsPerHost = 64
}
