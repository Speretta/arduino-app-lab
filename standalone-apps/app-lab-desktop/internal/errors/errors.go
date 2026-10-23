package errors

import (
	"app-lab-desktop/internal/hw"
	"app-lab-desktop/internal/tunnel"
	"encoding/json"
	"errors"

	"github.com/arduino/arduino-app-cli/pkg/board/remote/ssh"
	"github.com/wailsapp/wails/v2/pkg/options"
)

type ErrorMiddleware func(next options.ErrorFormatter) options.ErrorFormatter

func ChainErrorMiddleware(middlewares []ErrorMiddleware) options.ErrorFormatter {
	base := func(err error) any {
		if err == nil {
			return nil
		}
		return err.Error()
	}

	f := base
	for i := len(middlewares) - 1; i >= 0; i-- {
		f = middlewares[i](f)
	}
	return f
}

func TunnelSSHAuthFailedMiddleware() ErrorMiddleware {
	return func(next options.ErrorFormatter) options.ErrorFormatter {
		return func(err error) any {
			if errors.Is(err, ssh.ErrAuthFailed) {
				return tunnel.NewSSHErrorAuthFailed(err)
			}
			return next(err)
		}
	}
}

func HwErrorMiddleware() ErrorMiddleware {
	return func(next options.ErrorFormatter) options.ErrorFormatter {
		return func(err error) any {
			var hwErr *hw.HwError
			if errors.As(err, &hwErr) {
				// The Wails runtime rejects with new Error(value): an object would
				// become "[object Object]", so the JSON is sent as the message string.
				data, _ := json.Marshal(hwErr)
				return string(data)
			}
			return next(err)
		}
	}
}
