//go:build dev

package httpclient

import "os"

func init() {
	if hosts := os.Getenv("HTTPCLIENT_ALLOWLIST"); hosts != "" {
		allowlist = hosts
	}
}
