package parse

import (
	"reflect"
	"strings"
	"testing"
)

func TestArgs(t *testing.T) {
	tests := []struct {
		name         string
		argv         []string
		allowed      []string
		wantFlags    map[string]string
		wantBooleans map[string]bool
		wantPos      []string
		wantErr      string
	}{
		{"positionals only", []string{"a", "b"}, []string{"x"}, nil, nil, []string{"a", "b"}, ""},
		{
			"interspersed flags and positionals",
			[]string{"--x", "1", "pos", "-y=2", "pos2", "--paused", "-h"},
			[]string{"x", "y", "paused", "h"},
			map[string]string{"x": "1", "y": "2"},
			map[string]bool{"paused": true, "h": true},
			[]string{"pos", "pos2"},
			"",
		},
		{"long inline value", []string{"--x=a=b"}, []string{"x"}, map[string]string{"x": "a=b"}, nil, nil, ""},
		{"long empty inline value", []string{"--x="}, []string{"x"}, map[string]string{"x": ""}, nil, nil, ""},
		{"long space value", []string{"--x", "1"}, []string{"x"}, map[string]string{"x": "1"}, nil, nil, ""},
		{"long accepts dash value", []string{"--x", "-5"}, []string{"x"}, map[string]string{"x": "-5"}, nil, nil, ""},
		{"long rejects double-dash value", []string{"--x", "--y", "1"}, []string{"x", "y"}, nil, nil, nil, `flag "--x" requires a value`},
		{"long rejects separator as value", []string{"--x", "--"}, []string{"x"}, nil, nil, nil, `flag "--x" requires a value`},
		{"long missing value at end", []string{"--x"}, []string{"x"}, nil, nil, nil, `flag "--x" requires a value`},
		{"short space value", []string{"-x", "1"}, []string{"x"}, map[string]string{"x": "1"}, nil, nil, ""},
		{"short accepts bare dash value", []string{"-x", "-"}, []string{"x"}, map[string]string{"x": "-"}, nil, nil, ""},
		{"short accepts negative value", []string{"-x", "-5"}, []string{"x"}, map[string]string{"x": "-5"}, nil, nil, ""},
		{"short missing value at end", []string{"-x"}, []string{"x"}, nil, nil, nil, `flag "-x" requires a value`},
		{"long rejects short flag as value", []string{"--x", "-h"}, []string{"x", "h"}, nil, nil, nil, `flag "--x" requires a value`},
		{"short rejects short flag as value", []string{"-x", "-h"}, []string{"x", "h"}, nil, nil, nil, `flag "-x" requires a value`},
		{"equals permits dash-prefixed text", []string{"--x=-draft"}, []string{"x"}, map[string]string{"x": "-draft"}, nil, nil, ""},
		{
			"short inline value preserves next argument",
			[]string{"-x=5", "7"},
			[]string{"x"},
			map[string]string{"x": "5"},
			nil, []string{"7"}, "",
		},
		{"short inline value without next argument", []string{"-x=5"}, []string{"x"}, map[string]string{"x": "5"}, nil, nil, ""},
		{"separator collects remaining positionals", []string{"--x", "1", "--", "-y", "--z"}, []string{"x", "y"}, map[string]string{"x": "1"}, nil, []string{"-y", "--z"}, ""},
		{"bare dash is positional", []string{"-"}, []string{"x"}, nil, nil, []string{"-"}, ""},
		{"empty argv", nil, []string{"x"}, nil, nil, nil, ""},
		{"unknown long flag", []string{"--nope"}, []string{"x"}, nil, nil, nil, `unknown flag "--nope"`},
		{"unknown short flag", []string{"-n"}, []string{"x"}, nil, nil, nil, `unknown flag "-n"`},
		{"duplicate long flag", []string{"--x", "1", "--x", "2"}, []string{"x"}, nil, nil, nil, `duplicate flag "--x"`},
		{"duplicate across forms", []string{"--x", "1", "-x", "2"}, []string{"x"}, nil, nil, nil, `duplicate flag "-x"`},
		{"long boolean with value", []string{"--paused=true"}, []string{"paused"}, nil, nil, nil, `flag "--paused" does not accept a value`},
		{"short boolean with value", []string{"-h=1"}, []string{"h"}, nil, nil, nil, `flag "-h" does not accept a value`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Args(tt.argv, tt.allowed)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("Args(%v) error = %v, want %q", tt.argv, err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("Args(%v) unexpected error: %v", tt.argv, err)
			}
			wantFlags := tt.wantFlags
			if wantFlags == nil {
				wantFlags = map[string]string{}
			}
			wantBooleans := tt.wantBooleans
			if wantBooleans == nil {
				wantBooleans = map[string]bool{}
			}
			wantPos := tt.wantPos
			if !reflect.DeepEqual(got.Flags, wantFlags) {
				t.Errorf("Flags = %v, want %v", got.Flags, wantFlags)
			}
			if !reflect.DeepEqual(got.Booleans, wantBooleans) {
				t.Errorf("Booleans = %v, want %v", got.Booleans, wantBooleans)
			}
			if !reflect.DeepEqual(got.Positionals, wantPos) {
				t.Errorf("Positionals = %v, want %v", got.Positionals, wantPos)
			}
		})
	}
}
