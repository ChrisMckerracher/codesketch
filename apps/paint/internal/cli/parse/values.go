package parse

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

type Point struct {
	X, Y float64
}

type Region struct {
	X, Y, Width, Height float64
}

var (
	colorRegex      = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	identifierRegex = regexp.MustCompile(`^[a-zA-Z][0-9A-Za-z_-]{0,39}$`)
	spaceRegex      = regexp.MustCompile(`\s+`)
	separatorRegex  = regexp.MustCompile(`[,\s]+`)
)

func FiniteNumber(val, name string, bounds ...float64) (float64, error) {
	if val == "" {
		return 0, fmt.Errorf("missing value for %s", name)
	}
	if len(bounds) != 0 && len(bounds) != 2 {
		return 0, fmt.Errorf("invalid bounds for %s", name)
	}
	n, err := strconv.ParseFloat(val, 64)
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) {
		return 0, fmt.Errorf("%s must be a valid finite number, got %q", name, val)
	}
	if len(bounds) == 2 {
		if n < bounds[0] {
			return 0, fmt.Errorf("%s must be >= %s, got %s", name, formatNumber(bounds[0]), formatNumber(n))
		}
		if n > bounds[1] {
			return 0, fmt.Errorf("%s must be <= %s, got %s", name, formatNumber(bounds[1]), formatNumber(n))
		}
	}
	return n, nil
}

func Color(val string) (string, error) {
	if !colorRegex.MatchString(val) {
		return "", fmt.Errorf("color must be #rrggbb, got %q", val)
	}
	return strings.ToLower(val), nil
}

func Identifier(val string) (string, error) {
	if !identifierRegex.MatchString(val) {
		return "", fmt.Errorf("invalid identifier %q", val)
	}
	return val, nil
}

func Points(str string) ([]Point, error) {
	if str == "" {
		return nil, errors.New("points string required")
	}
	trimmed := strings.TrimSpace(str)
	if trimmed == "" {
		return nil, errors.New("points cannot be empty")
	}
	chunks := spaceRegex.Split(trimmed, -1)
	points := make([]Point, 0, len(chunks))
	for _, chunk := range chunks {
		parts := strings.Split(chunk, ",")
		if len(parts) != 2 {
			return nil, fmt.Errorf("points must be coordinate pairs like \"10,20\", got %q", chunk)
		}
		x, err := FiniteNumber(parts[0], "point x", 0, 1000)
		if err != nil {
			return nil, err
		}
		y, err := FiniteNumber(parts[1], "point y", 0, 700)
		if err != nil {
			return nil, err
		}
		points = append(points, Point{X: x, Y: y})
	}
	if len(points) == 0 {
		return nil, errors.New("stroke requires at least one point")
	}
	return points, nil
}

func Crop(str string) (Region, error) {
	if str == "" {
		return Region{}, errors.New("crop string required")
	}
	parts := separatorRegex.Split(strings.TrimSpace(str), -1)
	if len(parts) != 4 {
		return Region{}, fmt.Errorf("--crop requires 4 numbers \"x,y,w,h\", got %q", str)
	}
	x, err := FiniteNumber(parts[0], "crop x", 0, 1000)
	if err != nil {
		return Region{}, err
	}
	y, err := FiniteNumber(parts[1], "crop y", 0, 700)
	if err != nil {
		return Region{}, err
	}
	width, err := FiniteNumber(parts[2], "crop width", 1, 1000)
	if err != nil {
		return Region{}, err
	}
	height, err := FiniteNumber(parts[3], "crop height", 1, 700)
	if err != nil {
		return Region{}, err
	}
	return Region{X: x, Y: y, Width: width, Height: height}, nil
}

func Boolean(val, name string) (bool, error) {
	switch val {
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, fmt.Errorf("%s must be boolean (true or false), got %q", name, val)
	}
}

func formatNumber(n float64) string {
	return strconv.FormatFloat(n, 'g', -1, 64)
}
