import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js'

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId:   import.meta.env.VITE_COGNITO_CLIENT_ID,
}

const userPool = new CognitoUserPool(poolData)

// Decode a JWT and check the `exp` claim. Returns true if the token is missing,
// malformed, or expired (with a 30s clock-skew buffer so we don't ride the edge).
export function isTokenExpired(jwt) {
  if (!jwt) return true
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]))
    if (typeof payload.exp !== 'number') return true
    return Date.now() >= (payload.exp * 1000) - 30_000
  } catch {
    return true
  }
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      accessToken:  null,
      idToken:      null,
      refreshToken: null,
      email:        null,

      login: (email, password) =>
        new Promise((resolve, reject) => {
          const authDetails = new AuthenticationDetails({
            Username: email,
            Password: password,
          })
          const cognitoUser = new CognitoUser({ Username: email, Pool: userPool })

          cognitoUser.authenticateUser(authDetails, {
            onSuccess(result) {
              set({
                accessToken:  result.getAccessToken().getJwtToken(),
                idToken:      result.getIdToken().getJwtToken(),
                refreshToken: result.getRefreshToken().getToken(),
                email,
              })
              resolve(result)
            },
            onFailure(err) {
              reject(err)
            },
          })
        }),

      logout: () => {
        const cognitoUser = userPool.getCurrentUser()
        if (cognitoUser) cognitoUser.signOut()
        set({ accessToken: null, idToken: null, refreshToken: null, email: null })
      },
    }),
    {
      name: 'machx-admin-auth',
      // Persist short-lived tokens only. refreshToken is intentionally NOT
      // persisted: any future XSS would otherwise yield a long-lived admin
      // credential with permanent re-auth ability. Cognito SDK keeps the
      // refresh token in memory; admin will need to re-login on hard reload.
      partialize: state => ({
        accessToken: state.accessToken,
        idToken:     state.idToken,
        email:       state.email,
      }),
    }
  )
)
