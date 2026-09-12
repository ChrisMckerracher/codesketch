package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf16"
)

const (
	commentReplyTextMax  = 2000
	commentReplyLabelMax = 80
	commentReplyStampMax = 40
	commentReplyMax      = 32
)

func (comment *commentRecord) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return fmt.Errorf("invalid comment: %w", err)
	}
	if replies, present := fields["replies"]; present && bytes.Equal(bytes.TrimSpace(replies), []byte("null")) {
		return fmt.Errorf("comment replies must be an array when present")
	}
	type plain commentRecord
	var value plain
	if err := json.Unmarshal(data, &value); err != nil {
		return fmt.Errorf("invalid comment: %w", err)
	}
	*comment = commentRecord(value)
	return nil
}

func (reply *commentReply) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil || len(fields) != 5 {
		return fmt.Errorf("reply must contain exactly id, requestId, author, text, and at")
	}
	for _, field := range []string{"id", "requestId", "author", "text", "at"} {
		if _, ok := fields[field]; !ok {
			return fmt.Errorf("reply must contain exactly id, requestId, author, text, and at")
		}
	}
	type plain commentReply
	var value plain
	if err := json.Unmarshal(data, &value); err != nil {
		return fmt.Errorf("invalid reply: %w", err)
	}
	if err := validateCommentReply(commentReply(value)); err != nil {
		return err
	}
	*reply = commentReply(value)
	return nil
}

func validateCommentReply(reply commentReply) error {
	if reply.Author != "human" && reply.Author != "agent" {
		return fmt.Errorf("reply author must be human or agent")
	}
	if err := validateReplyLabel(reply.ID, "reply id", commentReplyLabelMax); err != nil {
		return err
	}
	if err := validateReplyLabel(reply.RequestID, "reply request id", commentReplyLabelMax); err != nil {
		return err
	}
	if strings.TrimSpace(reply.Text) == "" || utf16Length(reply.Text) > commentReplyTextMax {
		return fmt.Errorf("reply text requires 1..%d UTF-16 units", commentReplyTextMax)
	}
	return validateReplyLabel(reply.At, "reply timestamp", commentReplyStampMax)
}

func validateReplyLabel(value, name string, max int) error {
	if strings.TrimSpace(value) == "" || utf16Length(value) > max {
		return fmt.Errorf("%s requires 1..%d UTF-16 units", name, max)
	}
	return nil
}

func utf16Length(value string) int { return len(utf16.Encode([]rune(value))) }

func validateCommentReplies(comments []commentRecord) error {
	if len(comments) == 0 {
		return nil
	}
	ids := make(map[string]struct{})
	requests := make(map[string]struct{})
	for _, comment := range comments {
		if len(comment.Replies) > commentReplyMax {
			return fmt.Errorf("comment %s has more than %d replies", comment.ID, commentReplyMax)
		}
		for _, reply := range comment.Replies {
			if _, ok := ids[reply.ID]; ok {
				return fmt.Errorf("duplicate reply id %s", reply.ID)
			}
			if _, ok := requests[reply.RequestID]; ok {
				return fmt.Errorf("duplicate reply request id %s", reply.RequestID)
			}
			ids[reply.ID] = struct{}{}
			requests[reply.RequestID] = struct{}{}
		}
	}
	return nil
}

func acknowledgedAgentReply(comments []commentRecord, commentID, requestID, text string) (commentReply, bool) {
	for _, comment := range comments {
		if comment.ID != commentID {
			continue
		}
		for _, reply := range comment.Replies {
			if reply.RequestID == requestID && reply.Author == "agent" && reply.Text == text {
				return reply, true
			}
		}
	}
	return commentReply{}, false
}
