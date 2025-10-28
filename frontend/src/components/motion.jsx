import { motion } from 'framer-motion'

export const PageFade = ({children}) => (
  <motion.div
    initial={{opacity: 0, y: 12}}
    animate={{opacity: 1, y: 0}}
    transition={{duration: .35, ease: 'easeOut'}}
  >
    {children}
  </motion.div>
)

export const CardRise = ({ children, delay = 0, hover = true }) => (
  <motion.div
    initial={{opacity: 0, y: 8, scale: .98}}
    animate={{opacity: 1, y: 0, scale: 1}}
    transition={{duration: .3, delay, ease: 'easeOut'}}
    className={hover ? 'card' : ''}
  >
    {children}
  </motion.div>
)

export const Tap = ({children}) => (
  <motion.div whileTap={{scale:.98}} whileHover={{scale:1.01}} transition={{duration:.1}}>
    {children}
  </motion.div>
)
