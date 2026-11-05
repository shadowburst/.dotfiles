package main

import "testing"

func TestMergedAndDone(t *testing.T) {
	merged := pullRequest{State: "MERGED", HeadRefOid: "abc"}
	tests := []struct {
		name      string
		pr        pullRequest
		linked    bool
		head      string
		porcelain string
		statusOK  bool
		want      bool
	}{
		{"merged and clean", merged, true, "abc\n", "", true, true},
		{"main checkout", merged, false, "abc\n", "", true, false},
		{"open PR", pullRequest{State: "OPEN", HeadRefOid: "abc"}, true, "abc\n", "", true, false},
		{"commits after merge", merged, true, "def\n", "", true, false},
		{"dirty", merged, true, "abc\n", " M a.go\n", true, false},
		{"status failed", merged, true, "abc\n", "", false, false},
		{"head failed", merged, true, "", "", true, false},
	}
	for _, tt := range tests {
		if got := mergedAndDone(tt.pr, tt.linked, tt.head, tt.porcelain, tt.statusOK); got != tt.want {
			t.Errorf("%s: got %v", tt.name, got)
		}
	}
}

func TestPRLabel(t *testing.T) {
	tests := []struct {
		pr   pullRequest
		want string
	}{
		{pullRequest{Number: 7, State: "OPEN"}, " #7"},
		{pullRequest{Number: 7, State: "OPEN", IsDraft: true}, " #7"},
		{pullRequest{Number: 7, State: "MERGED"}, " #7"},
		{pullRequest{Number: 7, State: "CLOSED"}, " #7"},
		{pullRequest{Number: 7, State: "OPEN", ReviewDecision: "APPROVED"}, " #7 "},
		{pullRequest{Number: 7, State: "OPEN", ReviewDecision: "CHANGES_REQUESTED"}, " #7 "},
	}
	for _, tt := range tests {
		if got := prLabel(tt.pr); got != tt.want {
			t.Errorf("got %q, want %q", got, tt.want)
		}
	}
}
