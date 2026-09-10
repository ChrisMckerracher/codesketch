package parse

import (
	"fmt"
	"strconv"
	"strings"
)

var booleanFlags = map[string]bool{
	"artist-skill": true,
	"paused":       true,
	"replace":      true,
	"json":         true,
	"help":         true,
	"h":            true,
	"no-open":      true,
}

type Result struct {
	Flags       map[string]string
	Booleans    map[string]bool
	Positionals []string
}

func Args(argv []string, allowedFlags []string) (*Result, error) {
	allowed := make(map[string]bool, len(allowedFlags))
	for _, name := range allowedFlags {
		allowed[name] = true
	}
	result := &Result{Flags: map[string]string{}, Booleans: map[string]bool{}}
	seen := map[string]bool{}
	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		if arg == "--" {
			result.Positionals = append(result.Positionals, argv[i+1:]...)
			break
		}
		if strings.HasPrefix(arg, "--") {
			name, value, hasValue := strings.Cut(strings.TrimPrefix(arg, "--"), "=")
			if !allowed[name] {
				return nil, fmt.Errorf("unknown flag %q", "--"+name)
			}
			if seen[name] {
				return nil, fmt.Errorf("duplicate flag %q", "--"+name)
			}
			seen[name] = true
			if booleanFlags[name] {
				if hasValue {
					return nil, fmt.Errorf("flag %q does not accept a value", "--"+name)
				}
				result.Booleans[name] = true
				continue
			}
			if !hasValue {
				i++
				if i >= len(argv) || isFlagToken(argv[i]) {
					return nil, fmt.Errorf("flag %q requires a value", "--"+name)
				}
				value = argv[i]
			}
			result.Flags[name] = value
			continue
		}
		if arg != "-" && strings.HasPrefix(arg, "-") {
			name, value, hasValue := strings.Cut(arg[1:], "=")
			if !allowed[name] {
				return nil, fmt.Errorf("unknown flag %q", "-"+name)
			}
			if seen[name] {
				return nil, fmt.Errorf("duplicate flag %q", "-"+name)
			}
			seen[name] = true
			if booleanFlags[name] {
				if hasValue {
					return nil, fmt.Errorf("flag %q does not accept a value", "-"+name)
				}
				result.Booleans[name] = true
				continue
			}
			if !hasValue {
				i++
				if i >= len(argv) || isFlagToken(argv[i]) {
					return nil, fmt.Errorf("flag %q requires a value", "-"+name)
				}
				value = argv[i]
			}
			result.Flags[name] = value
			continue
		}
		result.Positionals = append(result.Positionals, arg)
	}
	return result, nil
}

// Dash-prefixed text values use the equals form. Negative numeric values and
// the stdin marker remain valid separated values; flags cannot be swallowed.
func isFlagToken(value string) bool {
	if value == "-" || !strings.HasPrefix(value, "-") {
		return false
	}
	_, err := strconv.ParseFloat(value, 64)
	return err != nil
}
