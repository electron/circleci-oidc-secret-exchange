export type BaseClaims = {
  sub: string;
};

export type CircleCIOIDCClaims = {
  /**
   * The subject. This identifies who is running the CircleCI job and where. Its value is "org/ORGANIZATION_ID/project/PROJECT_ID/user/USER_ID", a string, where ORGANIZATION_ID, PROJECT_ID, and USER_ID are UUIDs that identify the CircleCI organization, project, and user, respectively. The user is the CircleCI user that caused this job to run.
   */
  sub: string;
  /**
   * The ID of the project in which the job is running. Its value is a string containing a UUID identifying the CircleCI project.
   */
  'oidc.circleci.com/project-id': string;
  /**
   * An array of strings containing UUIDs that identify the context(s) used in the job. Currently, just one context is supported.
   */
  'oidc.circleci.com/context-ids': string[];
};

export type GitHubActionsOIDCClaims = {
  /**
   * The subject, this identifies the repo + org. It's value is "repo:foo/bar:environment:fee"
   */
  sub: string;
  /**
   * Environment the job is running in, if no environment will be empty
   */
  environment: string | null;
  /**
   * ID of the repo
   */
  repository_id: string;
  /**
   * ID of the org
   */
  repository_owner_id: string;
};
