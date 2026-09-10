package parse

import (
	"reflect"
	"strings"
	"testing"
)

func TestFiniteNumber(t *testing.T) {
	tests := []struct {
		val     string
		name    string
		bounds  []float64
		want    float64
		wantErr string
	}{
		{"5", "size", nil, 5, ""},
		{"0.5", "size", nil, 0.5, ""},
		{"-3", "size", nil, -3, ""},
		{"1e3", "size", nil, 1000, ""},
		{"", "size", nil, 0, "missing value for size"},
		{"abc", "size", nil, 0, `size must be a valid finite number, got "abc"`},
		{"Infinity", "size", nil, 0, `size must be a valid finite number, got "Infinity"`},
		{"NaN", "size", nil, 0, `size must be a valid finite number, got "NaN"`},
		{"1e400", "size", nil, 0, `size must be a valid finite number, got "1e400"`},
		{" 5", "size", nil, 0, `size must be a valid finite number, got " 5"`},
		{"5", "size", []float64{0, 10}, 5, ""},
		{"0", "size", []float64{0, 10}, 0, ""},
		{"10", "size", []float64{0, 10}, 10, ""},
		{"-1", "size", []float64{0, 10}, 0, "size must be >= 0, got -1"},
		{"11", "size", []float64{0, 10}, 0, "size must be <= 10, got 11"},
	}
	for _, tt := range tests {
		got, err := FiniteNumber(tt.val, tt.name, tt.bounds...)
		if tt.wantErr != "" {
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("FiniteNumber(%q) error = %v, want %q", tt.val, err, tt.wantErr)
			}
			continue
		}
		if err != nil {
			t.Errorf("FiniteNumber(%q) unexpected error: %v", tt.val, err)
			continue
		}
		if got != tt.want {
			t.Errorf("FiniteNumber(%q) = %v, want %v", tt.val, got, tt.want)
		}
	}
}

func TestColor(t *testing.T) {
	tests := []struct {
		val     string
		want    string
		wantErr string
	}{
		{"#ff0000", "#ff0000", ""},
		{"#AbC123", "#abc123", ""},
		{"#000000", "#000000", ""},
		{"#F00", "", `color must be #rrggbb, got "#F00"`},
		{"ff0000", "", `color must be #rrggbb, got "ff0000"`},
		{"#ff000", "", `color must be #rrggbb, got "#ff000"`},
		{"#ff00000", "", `color must be #rrggbb, got "#ff00000"`},
		{"#gg0000", "", `color must be #rrggbb, got "#gg0000"`},
		{"", "", `color must be #rrggbb, got ""`},
	}
	for _, tt := range tests {
		got, err := Color(tt.val)
		if tt.wantErr != "" {
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Color(%q) error = %v, want %q", tt.val, err, tt.wantErr)
			}
			continue
		}
		if err != nil {
			t.Errorf("Color(%q) unexpected error: %v", tt.val, err)
			continue
		}
		if got != tt.want {
			t.Errorf("Color(%q) = %q, want %q", tt.val, got, tt.want)
		}
	}
}

func TestIdentifier(t *testing.T) {
	tests := []struct {
		val     string
		wantErr string
	}{
		{"a", ""},
		{"A1-b_c", ""},
		{"abcdefghijabcdefghijabcdefghijabcdefghij", ""},
		{"abcdefghijabcdefghijabcdefghijabcdefghija", `invalid identifier`},
		{"1abc", `invalid identifier`},
		{"-abc", `invalid identifier`},
		{"_abc", `invalid identifier`},
		{"a b", `invalid identifier`},
		{"", `invalid identifier`},
	}
	for _, tt := range tests {
		got, err := Identifier(tt.val)
		if tt.wantErr != "" {
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Identifier(%q) error = %v, want %q", tt.val, err, tt.wantErr)
			}
			continue
		}
		if err != nil {
			t.Errorf("Identifier(%q) unexpected error: %v", tt.val, err)
			continue
		}
		if got != tt.val {
			t.Errorf("Identifier(%q) = %q", tt.val, got)
		}
	}
}

func TestPoints(t *testing.T) {
	tests := []struct {
		str     string
		want    []Point
		wantErr string
	}{
		{"10,20", []Point{{10, 20}}, ""},
		{"10,20 30,40", []Point{{10, 20}, {30, 40}}, ""},
		{"10,20\n30,40", []Point{{10, 20}, {30, 40}}, ""},
		{"  10,20   30,40  ", []Point{{10, 20}, {30, 40}}, ""},
		{"0,0 1000,700", []Point{{0, 0}, {1000, 700}}, ""},
		{"", nil, "points string required"},
		{"   ", nil, "points cannot be empty"},
		{"10", nil, `points must be coordinate pairs like "10,20", got "10"`},
		{"10,20,30", nil, `points must be coordinate pairs like "10,20", got "10,20,30"`},
		{"10,", nil, "missing value for point y"},
		{"1001,20", nil, "point x must be <= 1000, got 1001"},
		{"10,700.5", nil, "point y must be <= 700, got 700.5"},
		{"-1,5", nil, "point x must be >= 0, got -1"},
	}
	for _, tt := range tests {
		got, err := Points(tt.str)
		if tt.wantErr != "" {
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Points(%q) error = %v, want %q", tt.str, err, tt.wantErr)
			}
			continue
		}
		if err != nil {
			t.Errorf("Points(%q) unexpected error: %v", tt.str, err)
			continue
		}
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("Points(%q) = %v, want %v", tt.str, got, tt.want)
		}
	}
}

func TestCrop(t *testing.T) {
	tests := []struct {
		str     string
		want    Region
		wantErr string
	}{
		{"1,2,3,4", Region{1, 2, 3, 4}, ""},
		{"1, 2, 3, 4", Region{1, 2, 3, 4}, ""},
		{" 1 2 3 4 ", Region{1, 2, 3, 4}, ""},
		{"50,50,100,80", Region{50, 50, 100, 80}, ""},
		{"", Region{}, "crop string required"},
		{"1,2,3", Region{}, `--crop requires 4 numbers "x,y,w,h", got "1,2,3"`},
		{"1,2,3,4,", Region{}, `--crop requires 4 numbers "x,y,w,h", got "1,2,3,4,"`},
		{"1001,0,1,1", Region{}, "crop x must be <= 1000, got 1001"},
		{"0,701,1,1", Region{}, "crop y must be <= 700, got 701"},
		{"0,0,0,1", Region{}, "crop width must be >= 1, got 0"},
		{"0,0,1001,1", Region{}, "crop width must be <= 1000, got 1001"},
		{"0,0,1,700.5", Region{}, "crop height must be <= 700, got 700.5"},
	}
	for _, tt := range tests {
		got, err := Crop(tt.str)
		if tt.wantErr != "" {
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Crop(%q) error = %v, want %q", tt.str, err, tt.wantErr)
			}
			continue
		}
		if err != nil {
			t.Errorf("Crop(%q) unexpected error: %v", tt.str, err)
			continue
		}
		if got != tt.want {
			t.Errorf("Crop(%q) = %v, want %v", tt.str, got, tt.want)
		}
	}
}

func TestBoolean(t *testing.T) {
	tests := []struct {
		val     string
		want    bool
		wantErr string
	}{
		{"true", true, ""},
		{"false", false, ""},
		{"TRUE", false, `label must be boolean (true or false), got "TRUE"`},
		{"1", false, `label must be boolean (true or false), got "1"`},
		{"", false, `label must be boolean (true or false), got ""`},
	}
	for _, tt := range tests {
		got, err := Boolean(tt.val, "label")
		if tt.wantErr != "" {
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Boolean(%q) error = %v, want %q", tt.val, err, tt.wantErr)
			}
			continue
		}
		if err != nil {
			t.Errorf("Boolean(%q) unexpected error: %v", tt.val, err)
			continue
		}
		if got != tt.want {
			t.Errorf("Boolean(%q) = %v, want %v", tt.val, got, tt.want)
		}
	}
}
