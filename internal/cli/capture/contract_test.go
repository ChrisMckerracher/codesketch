package capture

import (
	"encoding/json"
	"os"
	"testing"
)

type contractCase struct {
	Name     string          `json:"name"`
	Drawable bool            `json:"drawable"`
	Active   json.RawMessage `json:"active"`
}

type contractSnapshot struct {
	Raw      json.RawMessage
	Drawable bool
}

func contractSnapshots(t *testing.T) map[string]contractSnapshot {
	t.Helper()
	raw, err := os.ReadFile("../../../tests/fixtures/capture-contract.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Snapshot json.RawMessage `json:"snapshot"`
		Cases    []contractCase  `json:"cases"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	result := make(map[string]contractSnapshot)
	for _, item := range fixture.Cases {
		var snapshot map[string]json.RawMessage
		if err := json.Unmarshal(fixture.Snapshot, &snapshot); err != nil {
			t.Fatal(err)
		}
		var playback map[string]json.RawMessage
		if err := json.Unmarshal(snapshot["playback"], &playback); err != nil {
			t.Fatal(err)
		}
		playback["active"] = item.Active
		snapshot["playback"], err = json.Marshal(playback)
		if err != nil {
			t.Fatal(err)
		}
		body, err := json.Marshal(snapshot)
		if err != nil {
			t.Fatal(err)
		}
		result[item.Name] = contractSnapshot{body, item.Drawable}
	}
	if len(result) != 6 {
		t.Fatal("shared capture contract must cover six command kinds")
	}
	return result
}

func TestSessionCaptureContract(t *testing.T) {
	for name, fixture := range contractSnapshots(t) {
		for _, committed := range []bool{false, true} {
			mode := "preview"
			if committed {
				mode = "export"
			}
			t.Run(name+"/"+mode, func(t *testing.T) {
				data, err := validateSnapshot(fixture.Raw, Options{Committed: committed})
				if err != nil {
					t.Fatal(err)
				}
				if (data.Active != nil) != (fixture.Drawable && !committed) {
					t.Fatal("capture must include only rendered transients")
				}
				if data.Document.Background != "#ffffff" || len(data.Document.Marks) != 1 ||
					len(data.Document.Layers) != 1 || !*data.Document.Layers[0].Visible || *data.Document.Layers[0].Opacity != 1 {
					t.Fatal("active command changed committed artwork")
				}
			})
		}
	}
}
