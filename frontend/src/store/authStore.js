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
      partialize: state => ({
        accessToken:  state.accessToken,
        idToken:      state.idToken,
        refreshToken: state.refreshToken,
        email:        state.email,
      }),
    }
  )
)
