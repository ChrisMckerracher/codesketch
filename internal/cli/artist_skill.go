package cli

import assets "github.com/ChrisMckerracher/codesketch"

func artistSkillBundle() string {
	return "# Offline artist skill\n\n" +
		"Relative reference paths identify the included sections below.\n\n" +
		"## SKILL.md\n\n" + assets.ArtistSkill + "\n\n" +
		"## references/season-one-example.md\n\n" + assets.ArtistSkillReferenceStudy + "\n\n" +
		"## references/cli-craft.md\n\n" + assets.ArtistSkillCLICraft
}
