# Optional professional-impact review

This is a reusable invitation and feedback form. It does not record an external
review, adoption, endorsement, or client validation. Use only with a reviewer who
has agreed to take part.

## Small review task

Choose one public framework and one test tied to a documented behavior. In a
disposable branch, make a small, meaningful test change, run the relevant
documented check, and inspect one controlled failure. Record whether the signal
points to the intended cause and what evidence made the diagnosis possible.

Use synthetic data and repository-owned targets. Do not include client names,
private artifacts, credentials, or personal data. Keep the code change and any
results in the reviewer's disposable checkout; opening an issue or pull request
is optional and requires the reviewer's choice.

## Feedback form

```text
Reviewer name or pseudonym:
Date and environment:
Repository and source commit:
Test changed and reason:
Check or controlled failure inspected:
Observed result and evidence path:
Could you identify the intended failure cause? What helped or blocked you?
Most useful diagnostic:
Largest limitation or unsupported claim:
Time spent, if recorded:
Issues or pull requests opened by choice:
Additional comments:
```

Leave values blank or write “not recorded” when they are unavailable. Do not
convert one review into a general adoption or reliability claim.
