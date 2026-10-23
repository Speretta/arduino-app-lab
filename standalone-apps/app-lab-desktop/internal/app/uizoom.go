package app

import "app-lab-desktop/internal/uizoom"

// SetUIZoom sets the zoom of the whole UI; 1 is 100%.
func (a *App) SetUIZoom(factor float64) {
	uizoom.Set(factor)
}

// IsUIZoomAvailable is false where SetUIZoom cannot change the zoom (Windows, macOS before 11), so
// the frontend must leave the zoom keys alone.
func (a *App) IsUIZoomAvailable() bool {
	return uizoom.Available()
}
