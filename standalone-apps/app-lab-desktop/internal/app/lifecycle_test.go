package app

import (
	"sync"
	"testing"

	"app-lab-desktop/internal/board"
)

// The guard that keeps the agent alive: selectBoard detaches it only when the board really changes, and a
// redundant SelectBoard for the board already selected (every app-detail mount fires one) must not count as a
// change. Identity is the serial, or the address for network boards, which report none.
func TestIsSelectedBoard(t *testing.T) {
	withIdentity := func(serial, address string) *board.Board {
		b := board.Noop()
		b.Info.Serial, b.Info.Address = serial, address
		return b
	}

	for name, tc := range map[string]struct {
		selected  *board.Board
		candidate *board.Board
		want      bool
	}{
		"the same serial is the same board":        {withIdentity("AAAA1111", ""), withIdentity("AAAA1111", ""), true},
		"another serial is a board change":         {withIdentity("AAAA1111", ""), withIdentity("BBBB2222", ""), false},
		"a network board matches on its address":   {withIdentity("", "192.168.1.7"), withIdentity("", "192.168.1.7"), true},
		"another address is a board change":        {withIdentity("", "192.168.1.7"), withIdentity("", "192.168.1.9"), false},
		"no identity on either side never matches": {withIdentity("", ""), withIdentity("", ""), false},
		"nothing selected yet is a board change":   {board.Noop(), withIdentity("AAAA1111", ""), false},
	} {
		a := &App{selectedBoard: tc.selected}
		if got := a.isSelectedBoard(tc.candidate); got != tc.want {
			t.Errorf("%s: isSelectedBoard = %v, want %v", name, got, tc.want)
		}
	}
}

// The agent now survives a same-board re-select, so its goroutines read the board while selectBoard installs the
// freshly connected one. Conn is an interface and tunnels a slice, so an unsynchronised read can see half of each
// board. Every agent-side reader has to go through boardSnapshot/boardConn, the board MCP tools and the mirror's
// file I/O alike — a call site that reads the field directly is the whole bug back. Only `go test -race` fails on
// one; without it this just exercises the paths.
func TestSelectedBoardSwapIsSafeWhileTheAgentReads(t *testing.T) {
	a := &App{selectedBoard: board.Noop()}
	incoming := board.Noop()
	incoming.Info.Serial = "AAAA1111"

	// The mirror's board-side reader. It fails on the Noop connection, which is fine: the read of the
	// connection is what this exercises.
	files := boardFiles{app: a}

	readers := []func(){
		func() { sb := a.boardSnapshot(); _, _ = sb.HasConn(), sb.Info.Serial },
		func() { _ = a.boardConn() },
		func() { _, _ = files.ListFiles("/tmp") },
		func() { _ = a.selectedBoardID() },
	}

	var wg sync.WaitGroup
	wg.Add(1 + len(readers))
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			a.setSelectedBoard(incoming)
		}
	}()
	for _, read := range readers {
		go func(read func()) {
			defer wg.Done()
			for i := 0; i < 200; i++ {
				read()
			}
		}(read)
	}
	wg.Wait()
}
