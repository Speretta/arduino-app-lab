package board

// test with `go test ./internal/board`

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsNoPortsError(t *testing.T) {
	// The text arduino-app-cli's FromFQBN returns when discovery lists no port.
	assert.True(t, isNoPortsError(errors.New("no hardware ID found for FQBNs arduino:zephyr:unoq,arduino:zephyr:ventunoq")))
	assert.False(t, isNoPortsError(errors.New("failed to get info for FQBNs arduino:zephyr:unoq: timeout")))
	assert.False(t, isNoPortsError(nil))
}
