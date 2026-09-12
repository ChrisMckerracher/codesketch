package cli

import (
	"fmt"
	"strings"
)

func completion(shell string) (string, error) {
	commands := strings.Join(commandNames(), " ") + " --artist-skill"
	switch shell {
	case "bash":
		var b strings.Builder
		b.WriteString("_paint_complete() {\n  local cur prev opts\n  COMPREPLY=()\n  cur=${COMP_WORDS[COMP_CWORD]}\n  prev=${COMP_WORDS[COMP_CWORD-1]}\n")
		fmt.Fprintf(&b, "  if (( COMP_CWORD == 1 )); then\n    COMPREPLY=( $(compgen -W '%s' -- \"$cur\") )\n    return\n  fi\n", commands)
		b.WriteString("  case \"$prev\" in\n    --brush) opts='brush pencil marker eraser';;\n    --visible) opts='true false';;\n    --browser) while IFS= read -r candidate; do COMPREPLY+=(\"$candidate\"); done < <(compgen -f -- \"$cur\"); return;;\n  esac\n  if [[ -z $opts ]]; then\n    case \"${COMP_WORDS[1]}\" in\n")
		for _, command := range commandNames() {
			fmt.Fprintf(&b, "      %s) opts='%s';;\n", command, completionWords(command))
		}
		b.WriteString("      --artist-skill) opts='--help --json';;\n")
		b.WriteString("    esac\n  fi\n  COMPREPLY=( $(compgen -W \"$opts\" -- \"$cur\") )\n}\ncomplete -o default -F _paint_complete paint\n")
		return b.String(), nil
	case "zsh":
		var b strings.Builder
		b.WriteString("#compdef paint\n_paint() {\n  local -a opts\n  if (( CURRENT == 2 )); then\n")
		fmt.Fprintf(&b, "    opts=(%s)\n    _describe 'paint command' opts\n    return\n  fi\n  case $words[CURRENT-1] in\n    --brush) compadd brush pencil marker eraser; return;;\n    --visible) compadd true false; return;;\n    --browser) _files; return;;\n  esac\n  case $words[2] in\n", commands)
		for _, command := range commandNames() {
			fmt.Fprintf(&b, "    %s) opts=(%s);;\n", command, completionWords(command))
		}
		b.WriteString("    --artist-skill) opts=(--help --json);;\n")
		b.WriteString("  esac\n  compadd -- $opts\n  _files\n}\ncompdef _paint paint\n")
		return b.String(), nil
	case "fish":
		var b strings.Builder
		fmt.Fprintf(&b, "complete -c paint -n '__fish_use_subcommand' -a '%s'\n", strings.Join(commandNames(), " "))
		b.WriteString("complete -c paint -n '__fish_use_subcommand' -l artist-skill\n")
		for _, command := range commandNames() {
			for _, flag := range strings.Fields(commandFlags[command] + " json help") {
				extra := " -r"
				if flag == "json" || flag == "help" || flag == "paused" || flag == "replace" || flag == "artist-skill" || flag == "no-open" {
					extra = ""
				}
				if flag == "brush" {
					extra += " -a 'brush pencil marker eraser'"
				}
				if flag == "visible" {
					extra += " -a 'true false'"
				}
				fmt.Fprintf(&b, "complete -c paint -n '__fish_seen_subcommand_from %s' -l %s%s\n", command, flag, extra)
			}
		}
		b.WriteString("complete -c paint -n '__fish_seen_subcommand_from layer' -a 'list add update'\ncomplete -c paint -n '__fish_seen_subcommand_from comments' -a 'list wait watch ack address reply'\ncomplete -c paint -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'\ncomplete -c paint -n '__fish_seen_subcommand_from studio' -a 'start status stop restart'\n")
		return b.String(), nil
	default:
		return "", usage("completion requires bash, zsh, or fish")
	}
}

func completionWords(command string) string {
	words := []string{"--help", "--json"}
	for _, flag := range strings.Fields(commandFlags[command]) {
		words = append(words, "--"+flag)
	}
	switch command {
	case "layer":
		words = append(words, "list", "add", "update")
	case "comments":
		words = append(words, "list", "wait", "watch", "ack", "address", "reply")
	case "completion":
		words = append(words, "bash", "zsh", "fish")
	case "studio":
		words = append(words, "start", "status", "stop", "restart")
	case "help":
		words = append(words, commandNames()...)
	}
	return strings.Join(words, " ")
}
