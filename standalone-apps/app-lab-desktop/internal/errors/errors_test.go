package errors

import (
	"app-lab-desktop/internal/hw"
	"fmt"
	"testing"
)

// The Wails runtime turns a non-string error into "[object Object]", so the
// frontend can only read the code if it arrives as a JSON string.
func TestHwErrorMiddlewareReturnsJSONString(t *testing.T) {
	format := ChainErrorMiddleware([]ErrorMiddleware{HwErrorMiddleware()})

	err := fmt.Errorf("failed to exec enable command: %w", &hw.HwError{Code: hw.ErrCodeIncorrectPassword, Message: "exit status 1"})
	want := `{"code":"ERR_HW_INCORRECT_PASSWORD","message":"exit status 1"}`
	if got := format(err); got != want {
		t.Errorf("format(hw error) = %v, want %v", got, want)
	}

	if got := format(fmt.Errorf("other")); got != "other" {
		t.Errorf("format(other error) = %v, want \"other\"", got)
	}
}
