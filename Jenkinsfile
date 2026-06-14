pipeline {
    agent any

    environment {
        NVM_DIR = '/home/ubuntu/.nvm'
    }

    stages {
        stage('Deploy') {
            steps {
                sh '''
                    export NVM_DIR="$NVM_DIR"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use 24
                    cd /var/www/todoflow
                    bash scripts/deploy.sh
                '''
            }
        }
    }

    post {
        success {
            echo 'TodoFlow 部署成功。'
        }
        failure {
            echo 'TodoFlow 部署失败，请检查 Jenkins Console Output。'
        }
    }
}
